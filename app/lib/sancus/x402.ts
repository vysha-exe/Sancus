// Sancus: x402 paid endpoints ("earning treasury").
//
// Outside AI agents pay per call in USDC through Circle Gateway nanopayments on
// Arc testnet (gasless, batched). Flow, following Circle's arc-nanopayments sample:
//   1. Request without payment → 402 + PAYMENT-REQUIRED header (base64 JSON terms).
//   2. Agent retries with a PAYMENT-SIGNATURE header (signed Gateway payment).
//   3. We verify + settle with Circle's facilitator, record the earning, post ledger
//      revenue to the receiving account, then serve the data with PAYMENT-RESPONSE.
// Money lands in the Gateway balance of `payTo` (the account's Arc treasury wallet),
// which the treasury summary already counts.

import { createHash } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server"
import { parseToMinor, USDC_DECIMALS, displayMinor } from "./money"
import { x402Journal } from "./ledger"

export const ARC_TESTNET_NETWORK = "eip155:5042002"
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000"
export const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9"

export type PaymentRequirements = {
  scheme: "exact"
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra: { name: string; version: string; verifyingContract: string }
}

export type PaidEndpoint = {
  path: string
  method: "GET"
  description: string
  /** USD decimal string, e.g. "0.01" */
  price: string
}

/** Every paid endpoint Sancus sells. Listed by GET /api/x402 for discovery. */
export const PAID_ENDPOINTS: PaidEndpoint[] = [
  {
    path: "/api/x402/route-quote",
    method: "GET",
    description:
      "Cheapest payout route into Asia right now: rail, FX rate, fee, total USDC cost and arrival time. Params: country (ID|TH), amount (local currency), recipientType (MOBILE|BANK).",
    price: process.env.SANCUS_X402_PRICE?.trim() || "0.01",
  },
]

export function priceToMinor(price: string): bigint {
  const m = parseToMinor(price.replace(/^\$/, ""), USDC_DECIMALS)
  if (m === null || m <= 0n) throw new Error(`Invalid x402 price: ${price}`)
  return m
}

export function buildRequirements(payTo: string, amountMinor: bigint): PaymentRequirements {
  return {
    scheme: "exact",
    network: ARC_TESTNET_NETWORK,
    asset: ARC_TESTNET_USDC,
    amount: amountMinor.toString(),
    payTo,
    // Gateway settles in batches later, so the signed authorization must stay valid long enough;
    // Circle's facilitator rejected 4 days ("authorization_validity_too_short").
    maxTimeoutSeconds: Number(process.env.SANCUS_X402_VALIDITY_SECONDS || 604800), // 7 days
    extra: { name: "GatewayWalletBatched", version: "1", verifyingContract: ARC_TESTNET_GATEWAY_WALLET },
  }
}

export const encodeHeader = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64")
export const decodeHeader = <T>(value: string): T => JSON.parse(Buffer.from(value, "base64").toString("utf-8")) as T

export function paymentRequired(endpoint: PaidEndpoint, requirements: PaymentRequirements) {
  return {
    x402Version: 2,
    resource: {
      url: endpoint.path,
      description: `${endpoint.description} (${endpoint.price} USDC per call)`,
      mimeType: "application/json",
    },
    accepts: [requirements],
  }
}

// ---------- receiving account (who gets paid) ----------

let admin: SupabaseClient | null = null
function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  admin ??= createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return admin
}

export type Seller = { userId: string | null; companyId: string | null; walletId: string | null; payTo: string }

let sellerCache: { value: Seller; at: number } | null = null

/**
 * The account that earns from x402 calls:
 * The configured receiving wallet must belong directly to the parent company.
 * Returns null when nothing is configured.
 */
export async function resolveSeller(): Promise<Seller | null> {
  if (sellerCache && Date.now() - sellerCache.at < 60_000) return sellerCache.value
  const db = adminClient()
  const configuredCompanyId = process.env.SANCUS_X402_COMPANY_ID?.trim() || null
  const configuredWalletId = process.env.SANCUS_X402_RECEIVING_WALLET_ID?.trim() || null
  const email = (process.env.SANCUS_X402_ACCOUNT_EMAIL || process.env.SANCUS_DEMO_EMAIL || "").trim().toLowerCase()
  let userId: string | null = null
  if (db && email) {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
    userId = data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
  }

  let companyId = configuredCompanyId
  if (!companyId && db && userId) {
    const { data } = await db
      .from("sancus_memberships")
      .select("company_id, sancus_companies!inner(parent_id)")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "ADMIN"])
    companyId = (data ?? []).find((row) => {
      const company = row.sancus_companies as unknown as { parent_id: string | null }
      return company.parent_id === null
    })?.company_id ?? null
  }

  let payTo = process.env.SANCUS_X402_PAY_TO?.trim() || ""
  let walletId = configuredWalletId
  if (db && companyId) {
    let query = db
      .from("wallets")
      .select("circle_wallet_id, address, type, company_id")
      .eq("company_id", companyId)
      .eq("blockchain", "ARC-TESTNET")
      .order("created_at", { ascending: true })
    if (configuredWalletId) query = query.eq("circle_wallet_id", configuredWalletId)
    const { data } = await query
    const wallet = configuredWalletId
      ? data?.[0]
      : data?.find((item) => item.type === "gateway_signer") ?? data?.find((item) => item.type === "treasury")
    if (!wallet) return null
    if (payTo && payTo.toLowerCase() !== wallet.address.toLowerCase()) return null
    walletId = wallet.circle_wallet_id
    payTo ||= wallet.address
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) return null

  const value = { userId, companyId, walletId, payTo }
  sellerCache = { value, at: Date.now() }
  return value
}

// ---------- earnings ----------

async function recordEarning(input: {
  seller: Seller
  endpoint: string
  payer: string
  amountMinor: bigint
  network: string
  gatewayTx: string | null
  paymentFingerprint: string
}) {
  const db = adminClient()
  if (!db || !input.seller.userId) {
    console.warn("[x402] Payment settled but no receiving account is configured; earning not recorded")
    return
  }
  const { data, error } = await db
    .from("sancus_x402_earnings")
    .insert({
      user_id: input.seller.userId,
      company_id: input.seller.companyId,
      wallet_id: input.seller.walletId,
      payment_fingerprint: input.paymentFingerprint,
      endpoint: input.endpoint,
      payer: input.payer,
      amount_minor: input.amountMinor.toString(),
      network: input.network,
      pay_to: input.seller.payTo,
      gateway_tx: input.gatewayTx,
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[x402] Failed to record earning", error)
    return
  }
  const journal = x402Journal(data.id as string, input.amountMinor, input.endpoint)
  const { error: jErr } = await db.rpc("sancus_post_journal_for", {
    p_user: input.seller.userId,
    p_source_type: journal.sourceType,
    p_source_id: journal.sourceId,
    p_event: journal.event,
    p_memo: journal.memo ?? null,
    p_entries: journal.entries.map((e) => ({
      account: e.account,
      direction: e.direction,
      amount_minor: e.amountMinor.toString(),
      currency: "USDC",
    })),
  })
  if (jErr) console.error("[x402] Failed to post revenue journal", jErr)
}

function paymentFingerprint(req: NextRequest, signature: string) {
  const url = new URL(req.url)
  const query = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  return createHash("sha256")
    .update([req.method, url.pathname, JSON.stringify(query), signature].join("|"))
    .digest("hex")
}

// ---------- route wrapper ----------

let facilitator: BatchFacilitatorClient | null = null

type FacilitatorPayload = Parameters<BatchFacilitatorClient["verify"]>[0]

/** Wraps a route handler so every call must be paid via x402 (Circle Gateway on Arc). */
export function withX402(endpoint: PaidEndpoint, handler: (req: NextRequest) => Promise<NextResponse>) {
  const amountMinor = priceToMinor(endpoint.price)

  return async (req: NextRequest) => {
    const seller = await resolveSeller()
    if (!seller) {
      return NextResponse.json(
        {
          error: "x402 payments are not configured",
          fix: "Set SANCUS_X402_PAY_TO (an Arc testnet address) or create an Arc wallet for the SANCUS_X402_ACCOUNT_EMAIL account.",
        },
        { status: 503 }
      )
    }
    const requirements = buildRequirements(seller.payTo, amountMinor)
    const signature = req.headers.get("payment-signature")

    if (!signature) {
      const terms = paymentRequired(endpoint, requirements)
      return NextResponse.json(
        {
          error: "Payment required",
          price: `${endpoint.price} USDC`,
          network: "Arc testnet (Circle Gateway nanopayments)",
          howToPay: "Use an x402 client, e.g. GatewayClient.pay() from @circle-fin/x402-batching/client",
          ...terms,
        },
        { status: 402, headers: { "PAYMENT-REQUIRED": encodeHeader(terms) } }
      )
    }

    let payload: FacilitatorPayload
    try {
      payload = decodeHeader<FacilitatorPayload>(signature)
    } catch {
      return NextResponse.json({ error: "Malformed PAYMENT-SIGNATURE header" }, { status: 400 })
    }

    try {
      facilitator ??= new BatchFacilitatorClient()
      const fingerprint = paymentFingerprint(req, signature)
      const db = adminClient()
      if (db) {
        const { data: replay } = await db
          .from("sancus_x402_earnings")
          .select("gateway_tx, payer")
          .eq("payment_fingerprint", fingerprint)
          .maybeSingle()
        if (replay) {
          const response = await handler(req)
          response.headers.set("PAYMENT-RESPONSE", encodeHeader({ success: true, transaction: replay.gateway_tx, payer: replay.payer, replayed: true }))
          return response
        }
      }
      const verified = await facilitator.verify(payload, requirements)
      if (!verified.isValid) {
        return NextResponse.json({ error: "Payment verification failed", reason: verified.invalidReason }, { status: 402 })
      }
      const settled = await facilitator.settle(payload, requirements)
      if (!settled.success) {
        return NextResponse.json({ error: "Payment settlement failed", reason: settled.errorReason }, { status: 402 })
      }

      const payer = settled.payer ?? verified.payer ?? "unknown"
      await recordEarning({
        seller,
        endpoint: endpoint.path,
        payer,
        amountMinor,
        network: requirements.network,
        gatewayTx: settled.transaction ?? null,
        paymentFingerprint: fingerprint,
      })
      console.log(`[x402] ${endpoint.path} paid ${displayMinor(amountMinor, USDC_DECIMALS, "", 6)} USDC by ${payer}`)

      const response = await handler(req)
      response.headers.set(
        "PAYMENT-RESPONSE",
        encodeHeader({ success: true, transaction: settled.transaction, network: requirements.network, payer })
      )
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Circle's facilitator answers 4xx for payments it refuses (bad signature, wrong
      // amount, malformed payload): that's a rejected payment, not a server error.
      if (/(verify|settle) failed \(4\d\d\)/i.test(message)) {
        return NextResponse.json({ error: "Payment rejected by Circle Gateway", reason: message }, { status: 402 })
      }
      console.error("[x402] Payment processing error:", message)
      return NextResponse.json({ error: "Payment processing error", message }, { status: 502 })
    }
  }
}
