// Sancus: submit and list ACH off-ramp payments (mock US rail, Bridge-shaped).
//
// POST flow (same guardrails as the Singapore payouts):
//   1. Idempotency-Key header required; a replay returns the original payment and moves nothing.
//   2. Fresh server-side quote; spending policy → BLOCK (403), NEEDS_APPROVAL (waits in Approvals)
//      or ALLOW.
//   3. Insert + reserve funds in the ledger (treasury:available → payouts:in_transit).
//   4. If allowed: TESTNET_SETTLEMENT sends real Arc USDC to the settlement wallet; MOCK_ONLY moves
//      nothing onchain. The ACH leg is then simulated (see lib/sancus/rails/ach-sim.ts).
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { quoteInputSchema, toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { prepareAch, settlementWallets } from "@/lib/sancus/ach-api"
import { faceUsdcEnabled } from "@/lib/sancus/face-usdc"
import { workspaceCompany } from "@/lib/sancus/workspace-server"
import { ACH_PROVIDER, executeAch, refreshAchPayments, syncAchLedger } from "@/lib/sancus/ach-server"

const createSchema = quoteInputSchema.extend({ reference: z.string().max(80).optional() })

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_ach_payments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: "Could not load payments" }, { status: 500 })
  const rows = await refreshAchPayments(supabase, (data ?? []) as AchPaymentRow[])
  return NextResponse.json({ payments: rows.map(toAchPaymentDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "money.send")
  if (denied) return denied
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }
  const replay = await findByKey(supabase, user.id, idempotencyKey)
  if (replay) return NextResponse.json({ payment: toAchPaymentDto(replay), replayed: true })

  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const prepared = await prepareAch(supabase, user.id, parsed.data)
  if (!prepared.ok) return NextResponse.json(prepared.body, { status: prepared.status })
  const { recipient, quote, evaluation } = prepared
  if (evaluation.decision === "BLOCK") {
    return NextResponse.json({ error: evaluation.reason, issues: [{ field: "usdAmount", message: evaluation.reason }] }, { status: 403 })
  }
  const needsApproval = evaluation.decision === "NEEDS_APPROVAL"

  // Acting for a company (workspace switcher): the payment is the company's, paid from its treasury.
  const companyId = await workspaceCompany(req, supabase, user.id)
  const wantsOnchain = quote.settlementMode === "TESTNET_SETTLEMENT" || faceUsdcEnabled()
  const wallets = wantsOnchain ? await settlementWallets(supabase, user.id, companyId) : { treasury: null, settlement: null }
  if (wantsOnchain && !wallets.treasury) {
    return NextResponse.json({ error: "Testnet settlement needs a Treasury wallet (set up your Treasury first)" }, { status: 409 })
  }
  if (quote.settlementMode === "TESTNET_SETTLEMENT" && !wallets.settlement && !faceUsdcEnabled()) {
    return NextResponse.json({ error: "Testnet settlement needs a Treasury and a settlement wallet (set up your Treasury first)" }, { status: 409 })
  }

  const { data: inserted, error } = await supabase
    .from("sancus_ach_payments")
    .insert({
      user_id: user.id,
      company_id: companyId,
      recipient_id: recipient.id,
      idempotency_key: idempotencyKey,
      recipient_name: recipient.name,
      routing_number: recipient.routing_number,
      bank_name: recipient.bank_name,
      account_last4: recipient.account_last4,
      account_type: recipient.account_type,
      speed: quote.speed,
      usd_amount_minor: quote.usdAmountMinor.toString(),
      fee_usd_minor: quote.feeUsdMinor.toString(),
      usdc_amount_minor: quote.usdcAmountMinor.toString(),
      reference: parsed.data.reference?.trim() || null,
      settlement_mode: quote.settlementMode,
      demo_mode: quote.demoMode,
      source_address: wallets.treasury,
      settlement_address: wallets.settlement,
      provider: ACH_PROVIDER,
      provider_ref: `trf_sim_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
      status: needsApproval ? "PENDING_APPROVAL" : "CREATED",
      approval_reason: evaluation.reason,
    })
    .select("*")
    .single()
  if (error || !inserted) {
    if (error?.code === "23505") {
      const raced = await findByKey(supabase, user.id, idempotencyKey)
      if (raced) return NextResponse.json({ payment: toAchPaymentDto(raced), replayed: true })
    }
    console.error("Failed to create ACH payment", error)
    return NextResponse.json({ error: "Could not create the payment" }, { status: 500 })
  }

  let row = inserted as AchPaymentRow
  await syncAchLedger(supabase, row) // reserve funds, also while waiting for approval
  if (needsApproval) return NextResponse.json({ payment: toAchPaymentDto(row), needsApproval: true }, { status: 201 })
  row = await executeAch(supabase, user.id, row)
  return NextResponse.json({ payment: toAchPaymentDto(row) }, { status: 201 })
})

async function findByKey(db: SupabaseClient, userId: string, key: string) {
  const { data } = await db.from("sancus_ach_payments").select("*").eq("user_id", userId).eq("idempotency_key", key).maybeSingle()
  return (data as AchPaymentRow | null) ?? null
}
