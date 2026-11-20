// Sancus: create and list Singapore payouts.
//
// POST flow:
//   1. Validate recipient + amount, compute a fresh quote server-side (never trust client numbers).
//   2. Spending policy: blocked → 403; at/over the approval rule → PENDING_APPROVAL (funds reserved).
//      Employees can only request: every payment they start waits for an admin (approval-rules.ts).
//   3. Insert the payout (idempotent on the Idempotency-Key header) and reserve the branch bank funds.
//   4. If allowed: executePayout() hands off to the payout provider and captures the bank hold on settlement.
import { NextResponse } from "next/server"
import { z } from "zod"
import { evmAddressSchema, validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { applyRoleApproval, EMPLOYEE_REQUEST_REASON, paymentMode } from "@/lib/sancus/approval-rules"
import { notifyApprovers } from "@/lib/sancus/approval-notify"
import { formatRate } from "@/lib/sancus/fx"
import { getPayoutProvider } from "@/lib/sancus/payout-provider"
import { evaluatePayout, isNewRecipient, loadCompanyPolicy, loadPolicy, spentToday } from "@/lib/sancus/policy"
import { companyIdFromRequest } from "@/lib/sancus/workspace"
import { liveSgdFxConfig } from "@/lib/sancus/live-fx"
import { reserveSpendFunds } from "@/lib/sancus/spend-funding"
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
  if (companyId && sourceWalletId) {
    return NextResponse.json({ error: "Branch payouts use the branch operating bank account" }, { status: 400 })
  }
  const { data: sourceBankAccount } = companyId
    ? await supabase.from("sancus_receive_accounts").select("id, currency").eq("company_id", companyId).maybeSingle()
    : { data: null }
  if (companyId && !sourceBankAccount) {
    return NextResponse.json({ error: "This branch needs an operating bank account before it can pay" }, { status: 409 })
  }
  if (sourceBankAccount && sourceBankAccount.currency !== "SGD") {
    return NextResponse.json({ error: `PayNow and FAST require an SGD operating account, not ${sourceBankAccount.currency}` }, { status: 409 })
  }

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
  if (!companyId && !treasuryWallet && !requestOnly) {
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
  const settlementRaw = companyId ? "" : process.env.SANCUS_SETTLEMENT_ADDRESS?.trim() || settlementWallet?.address || ""
  const settlementAddress = settlementRaw && evmAddressSchema.safeParse(settlementRaw).success ? settlementRaw : null

  // Paying wallet: the one picked in the UI, else the Treasury.
  let sourceWallet: { address: string; blockchain: string } | null = companyId ? null : treasuryWallet
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
  const policyEvaluation = evaluatePayout({
    policy,
    amountMinor: quote.usdcAmountMinor,
    recipient: { name: recipient.name, proxyValue: recipient.proxyValue },
    spentTodayMinor: await spentToday(supabase, user.id),
    isNewRecipient: policy.rules.newRecipients
      ? await isNewRecipient(supabase, user.id, { name: recipient.name, proxyValue: recipient.proxyValue })
      : false,
  })
  // Business admin skips the approval rules on company payments; everyone else keeps the policy.
  const evaluation = applyRoleApproval(account, companyId, policyEvaluation)
  if (evaluation.decision === "BLOCK") {
    return NextResponse.json(
      { error: evaluation.reason, issues: [{ field: "amount", message: evaluation.reason }] },
      { status: 403 }
    )
  }
  const needsApproval = requestOnly || evaluation.decision === "NEEDS_APPROVAL"
  const approvalReason = !needsApproval
    ? null
    : requestOnly && policyEvaluation.decision === "ALLOW" ? EMPLOYEE_REQUEST_REASON : evaluation.reason

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
      source_bank_account_id: sourceBankAccount?.id ?? null,
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
  if (sourceBankAccount) {
    const fundingAmount = BigInt(quote.sgdAmountMinor) + BigInt(quote.feeSgdMinor)
    const holdRef = `payout:${row.id}`
    try {
      await reserveSpendFunds(supabase, {
        accountId: sourceBankAccount.id,
        amountMinor: fundingAmount,
        ref: holdRef,
        sourceType: "PAYOUT",
        sourceId: row.id,
      })
      const { data: funded } = await supabase.from("sancus_payouts").update({
        funding_status: "HELD", funding_amount_minor: fundingAmount.toString(), funding_hold_reference: holdRef,
      }).eq("id", row.id).select("*").single()
      if (funded) row = funded as PayoutRow
    } catch (cause) {
      await supabase.from("sancus_payouts").update({
        status: "FAILED", funding_status: "UNFUNDED",
        failure_reason: cause instanceof Error ? cause.message : "Insufficient bank balance",
      }).eq("id", row.id)
      return NextResponse.json({ error: cause instanceof Error ? cause.message : "Insufficient bank balance" }, { status: 409 })
    }
  }
  // Retain the existing accounting journal while the operating-account hold is authoritative for branches.
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
