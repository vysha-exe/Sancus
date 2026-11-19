// Sancus: create and list Singapore payouts.
//
// POST flow:
//   1. Validate recipient + amount, compute a fresh quote server-side (never trust client numbers).
//   2. Spending policy: blocked → 403; at/over the approval rule → PENDING_APPROVAL (funds reserved).
//      Employees can only request: every payment they start waits for an admin (approval-rules.ts).
//   3. Insert the payout (idempotent on the Idempotency-Key header) and reserve funds in the ledger.
//   4. If allowed: executePayout() runs the USDC leg on Arc (when SANCUS_SETTLEMENT_ADDRESS is set)
//      and hands off to the payout provider (simulated until StraitsX sandbox access).
import { NextResponse } from "next/server"
import { z } from "zod"
import { evmAddressSchema, validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { EMPLOYEE_REQUEST_REASON, paymentMode } from "@/lib/sancus/approval-rules"
import { notifyApprovers } from "@/lib/sancus/approval-notify"
import { formatRate } from "@/lib/sancus/fx"
import { getPayoutProvider } from "@/lib/sancus/payout-provider"
import { evaluatePayout, isNewRecipient, loadCompanyPolicy, loadPolicy, spentToday } from "@/lib/sancus/policy"
import { companyIdFromRequest } from "@/lib/sancus/workspace"
import { liveSgdFxConfig } from "@/lib/sancus/live-fx"
import {
  executePayout,
  preparePayout,
  quoteRequestSchema,
  refreshPayoutStatuses,
  syncPayoutLedger,
  toPayoutDto,
  type PayoutRow,
} from "@/lib/sancus/payouts"

type Db = Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"]
type ArcWallet = { address: string; blockchain: string; type: string }

/** A Settlement ("payout") wallet for the USDC leg: the caller's own, else the global account owner's. */
async function fallbackSettlementWallet(supabase: Db, userId: string, companyId: string | null): Promise<ArcWallet | null> {
  const payoutWalletOf = async (uid: string) => {
    const { data } = await supabase
      .from("wallets")
      .select("address, blockchain, type")
      .eq("user_id", uid)
      .eq("blockchain", "ARC-TESTNET")
      .eq("type", "payout")
      .is("company_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
    return (data?.[0] as ArcWallet | undefined) ?? null
  }
  const own = await payoutWalletOf(userId)
  if (own || !companyId) return own
  const { data: node } = await supabase.from("sancus_companies").select("root_id").eq("id", companyId).maybeSingle()
  const rootId = (node?.root_id as string | undefined) ?? companyId
  const { data: owners } = await supabase
    .from("sancus_memberships")
    .select("user_id")
    .eq("company_id", rootId)
    .eq("role", "OWNER")
    .eq("status", "ACTIVE")
    .not("user_id", "is", null)
  for (const o of owners ?? []) {
    const w = await payoutWalletOf(o.user_id as string)
    if (w) return w
  }
  return null
}

const createSchema = quoteRequestSchema.extend({
  sourceWalletId: z.string().min(1).optional(),
  reference: z.string().max(140).optional(),
})

export const GET = withAuth(async (req, { user, supabase }) => {
  const companyId = companyIdFromRequest(req.headers, req.headers.get("cookie"))
  let query = supabase.from("sancus_payouts").select("*").order("created_at", { ascending: false }).limit(50)
  if (companyId) {
    query = query.eq("company_id", companyId)
  } else {
    query = query.eq("user_id", user.id).is("company_id", null)
  }
  const { data, error } = await query

  if (error) {
    console.error("Failed to list payouts", error)
    return NextResponse.json({ error: "Could not load payouts" }, { status: 500 })
  }

  const refreshed = await refreshPayoutStatuses(supabase, (data ?? []) as PayoutRow[])
  return NextResponse.json({ payouts: refreshed.map(toPayoutDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  const mode = paymentMode(account)
  if (!mode) {
    return NextResponse.json(
      { error: "Your account can't send money. Ask an admin to make this payment.", accountType: account.type, missing: "money.send" },
      { status: 403 }
    )
  }
  const requestOnly = mode === "REQUEST"
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }

  // Requests are always for a company: the selected one, else the employee's own.
  const companyId =
    companyIdFromRequest(req.headers, req.headers.get("cookie")) ?? (requestOnly ? account.scopes[0]?.companyId ?? null : null)
  if (requestOnly && !companyId) {
    return NextResponse.json({ error: "You need to be part of a company to request a payment" }, { status: 403 })
  }
  if (companyId) {
    const { data: allowed } = await supabase.rpc("sancus_can_access_company", {
      p_user: user.id,
      p_company: companyId,
    })
    if (!allowed) {
      return NextResponse.json({ error: "No access to that company" }, { status: 403 })
    }
  }

  // Replay: same key returns the original payout and moves no money.
  const existing = await findByKey(supabase, user.id, idempotencyKey)
  if (existing) return NextResponse.json({ payout: toPayoutDto(existing), replayed: true })

  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const { sourceWalletId, reference } = parsed.data
  if (requestOnly && sourceWalletId) {
    return NextResponse.json({ error: "Only admins can choose which wallet pays" }, { status: 403 })
  }

  const prepared = preparePayout(parsed.data, await liveSgdFxConfig())
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, issues: prepared.issues }, { status: prepared.status })
  }
  const { recipient, quote } = prepared

  // Treasury and Settlement wallets: company node when scoped, else personal.
  // A company's wallets may have been created by any admin, so match on the company, not the caller.
  let walletQuery = supabase
    .from("wallets")
    .select("address, blockchain, type")
    .eq("blockchain", "ARC-TESTNET")
    .in("type", ["treasury", "payout"])
    .order("created_at", { ascending: true })
  walletQuery = companyId ? walletQuery.eq("company_id", companyId) : walletQuery.eq("user_id", user.id).is("company_id", null)
  const { data: arcWallets } = await walletQuery
  // Fall back to personal treasury if the company node has none yet.
  let treasuryWallet = arcWallets?.find((w) => w.type === "treasury") ?? null
  let settlementWallet = arcWallets?.find((w) => w.type === "payout") ?? null
  // (Never for requests: an employee's personal wallet must not pay a company bill.)
  if (companyId && !treasuryWallet && !requestOnly) {
    const { data: personal } = await supabase
      .from("wallets")
      .select("address, blockchain, type")
      .eq("user_id", user.id)
      .eq("blockchain", "ARC-TESTNET")
      .in("type", ["treasury", "payout"])
      .is("company_id", null)
      .order("created_at", { ascending: true })
    treasuryWallet = personal?.find((w) => w.type === "treasury") ?? null
    settlementWallet = personal?.find((w) => w.type === "payout") ?? null
  }

  // Employee requests from a branch without its own treasury are paid by the global account's.
  if (requestOnly && companyId && !treasuryWallet) {
    const { data: node } = await supabase.from("sancus_companies").select("root_id").eq("id", companyId).maybeSingle()
    const rootId = node?.root_id as string | undefined
    if (rootId && rootId !== companyId) {
      const { data: rootWallets } = await supabase
        .from("wallets")
        .select("address, blockchain, type")
        .eq("company_id", rootId)
        .eq("blockchain", "ARC-TESTNET")
        .in("type", ["treasury", "payout"])
        .order("created_at", { ascending: true })
      treasuryWallet = rootWallets?.find((w) => w.type === "treasury") ?? null
      settlementWallet = rootWallets?.find((w) => w.type === "payout") ?? null
    }
  }

  // Company nodes only hold a treasury wallet. Without a settlement wallet the onchain USDC leg would
  // be skipped (no tx hash, nothing leaves the treasury), so settle to the caller's own Settlement
  // wallet, else the global account owner's.
  if (!settlementWallet && !process.env.SANCUS_SETTLEMENT_ADDRESS?.trim()) {
    settlementWallet = await fallbackSettlementWallet(supabase, user.id, companyId)
  }

  // Partner deposit address: env override (e.g. StraitsX's address), else our Settlement wallet.
  const settlementRaw = process.env.SANCUS_SETTLEMENT_ADDRESS?.trim() || settlementWallet?.address || ""
  const settlementAddress = settlementRaw && evmAddressSchema.safeParse(settlementRaw).success ? settlementRaw : null

  // Paying wallet: the one picked in the UI, else the Treasury.
  let sourceWallet: { address: string; blockchain: string } | null = treasuryWallet
  if (sourceWalletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("address, blockchain")
      .eq("user_id", user.id)
      .eq("circle_wallet_id", sourceWalletId)
      .single()
    if (!wallet?.blockchain) {
      return NextResponse.json({ error: "Source wallet not found" }, { status: 404 })
    }
    sourceWallet = wallet
  }

  const provider = getPayoutProvider()
  const willSendOnchain = Boolean(settlementAddress && sourceWallet)

  // Spending policy: company node when scoped, else personal.
  const policy = companyId
    ? await loadCompanyPolicy(supabase, companyId, user.id)
    : await loadPolicy(supabase, user.id)
  const evaluation = evaluatePayout({
    policy,
    amountMinor: quote.usdcAmountMinor,
    recipient: { name: recipient.name, proxyValue: recipient.proxyValue },
    spentTodayMinor: await spentToday(supabase, user.id),
    isNewRecipient: policy.rules.newRecipients
      ? await isNewRecipient(supabase, user.id, { name: recipient.name, proxyValue: recipient.proxyValue })
      : false,
  })
  if (evaluation.decision === "BLOCK") {
    return NextResponse.json(
      { error: evaluation.reason, issues: [{ field: "amount", message: evaluation.reason }] },
      { status: 403 }
    )
  }
  const needsApproval = requestOnly || evaluation.decision === "NEEDS_APPROVAL"
  const approvalReason = evaluation.reason ?? (requestOnly ? EMPLOYEE_REQUEST_REASON : null)

  const { data: inserted, error: insertError } = await supabase
    .from("sancus_payouts")
    .insert({
      user_id: user.id,
      company_id: companyId,
      idempotency_key: idempotencyKey,
      recipient_name: recipient.name,
      proxy_type: recipient.proxyType,
      proxy_value: recipient.proxyValue,
      bank_code: recipient.bankCode ?? null,
      rail: quote.rail,
      reference: reference?.trim() || null,
      sgd_amount_minor: quote.sgdAmountMinor.toString(),
      fee_sgd_minor: quote.feeSgdMinor.toString(),
      usdc_amount_minor: quote.usdcAmountMinor.toString(),
      mid_rate: formatRate(quote.midRateMicro),
      client_rate: formatRate(quote.clientRateMicro),
      spread_bps: Number(quote.spreadBps),
      source_wallet_id: sourceWalletId ?? null,
      source_address: sourceWallet?.address ?? null,
      blockchain: sourceWallet?.blockchain ?? null,
      settlement_address: settlementAddress,
      provider: provider.name,
      status: needsApproval ? "PENDING_APPROVAL" : "CREATED",
      approval_reason: approvalReason,
      // Fully real only when both the treasury leg is onchain and the partner is live.
      simulated: provider.simulated || !willSendOnchain,
    })
    .select("*")
    .single()

  if (insertError || !inserted) {
    // Unique violation = a concurrent request with the same key won the race.
    if (insertError?.code === "23505") {
      const raced = await findByKey(supabase, user.id, idempotencyKey)
      if (raced) return NextResponse.json({ payout: toPayoutDto(raced), replayed: true })
    }
    console.error("Failed to create payout", insertError)
    return NextResponse.json({ error: "Could not create payout" }, { status: 500 })
  }

  let row = inserted as PayoutRow
  // Ledger: reserve the USDC (available → in transit), also while waiting for approval.
  await syncPayoutLedger(supabase, row)

  // Over the approval rule: stop here. Money moves when someone approves it.
  if (needsApproval) {
    await notifyApprovers({
      requesterId: user.id,
      companyId,
      title: `Approve payment to ${recipient.name}`,
      body: approvalReason ?? "Needs your approval",
      payload: { payoutId: row.id, companyId },
    })
    return NextResponse.json({ payout: toPayoutDto(row), needsApproval: true }, { status: 201 })
  }

  row = await executePayout(supabase, user.id, row)
  return NextResponse.json({ payout: toPayoutDto(row) }, { status: 201 })
})

async function findByKey(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  userId: string,
  key: string
): Promise<PayoutRow | null> {
  const { data } = await supabase
    .from("sancus_payouts")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle()
  return (data as PayoutRow | null) ?? null
}
