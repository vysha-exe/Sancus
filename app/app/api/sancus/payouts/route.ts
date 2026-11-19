// Sancus: create and list Singapore payouts.
//
// POST flow:
//   1. Validate recipient + amount, compute a fresh quote server-side (never trust client numbers).
//   2. Spending policy: blocked → 403; at/over the approval rule → PENDING_APPROVAL (funds reserved).
//   3. Insert the payout (idempotent on the Idempotency-Key header) and reserve funds in the ledger.
//   4. If allowed: executePayout() runs the USDC leg on Arc (when SANCUS_SETTLEMENT_ADDRESS is set)
//      and hands off to the payout provider (simulated until StraitsX sandbox access).
import { NextResponse } from "next/server"
import { z } from "zod"
import { evmAddressSchema, validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
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
  const denied = await requirePermission(supabase, user, "money.send")
  if (denied) return denied
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }

  const companyId = companyIdFromRequest(req.headers, req.headers.get("cookie"))
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

  const prepared = preparePayout(parsed.data, await liveSgdFxConfig())
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, issues: prepared.issues }, { status: prepared.status })
  }
  const { recipient, quote } = prepared

  // Treasury and Settlement wallets: company node when scoped, else personal.
  let walletQuery = supabase
    .from("wallets")
    .select("address, blockchain, type")
    .eq("user_id", user.id)
    .eq("blockchain", "ARC-TESTNET")
    .in("type", ["treasury", "payout"])
    .order("created_at", { ascending: true })
  walletQuery = companyId ? walletQuery.eq("company_id", companyId) : walletQuery.is("company_id", null)
  const { data: arcWallets } = await walletQuery
  // Fall back to personal treasury if the company node has none yet.
  let treasuryWallet = arcWallets?.find((w) => w.type === "treasury") ?? null
  let settlementWallet = arcWallets?.find((w) => w.type === "payout") ?? null
  if (companyId && !treasuryWallet) {
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
  const needsApproval = evaluation.decision === "NEEDS_APPROVAL"

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
      approval_reason: evaluation.reason,
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
    await supabase.from("sancus_notifications").insert({
      user_id: user.id,
      company_id: companyId,
      type: "approval.requested",
      category: "approvals",
      priority: "action",
      title: `Approve payment to ${recipient.name}`,
      body: evaluation.reason ?? "Needs your approval",
      link: "/activity",
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
