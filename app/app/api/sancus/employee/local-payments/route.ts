import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"
import {
  createXenditPayout,
  isXenditConfigured,
  isXenditMoneyOutForbidden,
  mapXenditStatus,
  sanitizeXenditPayout,
  simulatedXenditPayout,
  type XenditCreateInput,
  type XenditPayout,
} from "@/lib/sancus/rails/xendit"
import { maskAccountNumber, toXenditPayoutDto, type XenditPayoutRow } from "@/lib/sancus/xendit-payouts"

const schema = z.object({
  spendingMethodId: z.string().uuid(),
  recipientName: z.string().trim().min(1).max(120),
  promptPayId: z.string().trim().min(4).max(64),
  amountThb: z.number().positive().max(2_000_000),
  qrPayload: z.string().trim().min(20).max(10_000),
})

const startOf = (kind: "month" | "day") => {
  const value = new Date()
  if (kind === "month") value.setUTCDate(1)
  value.setUTCHours(0, 0, 0, 0)
  return value.toISOString()
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const { supabase: admin } = await createAdminContext()
  const { data, error } = await admin.from("sancus_xendit_payouts").select("*").eq("employee_id", user.id).order("created_at", { ascending: false }).limit(30)
  if (error) return NextResponse.json({ error: "Could not load local payments" }, { status: 500 })
  return NextResponse.json({ payouts: ((data ?? []) as XenditPayoutRow[]).map(toXenditPayoutDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { supabase: admin } = await createAdminContext()
  const { data: method } = await admin.from("sancus_spending_methods").select("*")
    .eq("id", parsed.data.spendingMethodId).eq("employee_id", user.id).eq("method_type", "PROMPTPAY").maybeSingle()
  if (!method) return NextResponse.json({ error: "PromptPay access is not assigned to your login" }, { status: 404 })
  if (method.status !== "ACTIVE") return NextResponse.json({ error: `Declined: PromptPay access is ${String(method.status).toLowerCase()}` }, { status: 403 })

  const amountMinor = BigInt(Math.round(parsed.data.amountThb * 100))
  const [{ data: membership }, { data: month }, { data: today }] = await Promise.all([
    admin.from("sancus_memberships").select("per_payment_limit_minor, daily_limit_minor").eq("user_id", user.id).eq("status", "ACTIVE").limit(1).maybeSingle(),
    admin.from("sancus_xendit_payouts").select("amount_minor").eq("spending_method_id", method.id).in("status", ["PENDING", "COMPLIANCE_REVIEW", "SETTLED"]).gte("created_at", startOf("month")),
    admin.from("sancus_xendit_payouts").select("amount_minor, currency").eq("employee_id", user.id).in("status", ["PENDING", "COMPLIANCE_REVIEW", "SETTLED"]).gte("created_at", startOf("day")),
  ])
  const usdMicro = BigInt(Math.round((parsed.data.amountThb / FIXED_USD_RATES.THB) * 1_000_000))
  if (membership?.per_payment_limit_minor != null && usdMicro > BigInt(membership.per_payment_limit_minor)) {
    return NextResponse.json({ error: "Declined: this payment exceeds your per-payment limit" }, { status: 403 })
  }
  const monthUsed = (month ?? []).reduce((sum, row) => sum + BigInt(row.amount_minor), 0n)
  if (monthUsed + amountMinor > BigInt(method.monthly_limit_minor)) {
    return NextResponse.json({ error: "Declined: this payment exceeds your monthly PromptPay limit" }, { status: 403 })
  }
  const todayUsdMicro = (today ?? []).reduce((sum, row) => {
    const rate = row.currency === "THB" ? FIXED_USD_RATES.THB : row.currency === "IDR" ? FIXED_USD_RATES.IDR : 1
    const decimals = row.currency === "IDR" ? 1 : 100
    return sum + BigInt(Math.round((Number(row.amount_minor) / decimals / rate) * 1_000_000))
  }, 0n)
  if (membership?.daily_limit_minor != null && todayUsdMicro + usdMicro > BigInt(membership.daily_limit_minor)) {
    return NextResponse.json({ error: "Declined: this payment exceeds your daily limit" }, { status: 403 })
  }

  const idempotencyKey = randomUUID()
  const reference = `sancus-employee-promptpay-${randomUUID()}`
  const request: XenditCreateInput = {
    idempotencyKey, referenceId: reference, country: "TH", currency: "THB",
    recipientName: parsed.data.recipientName, accountNumber: parsed.data.promptPayId,
    routingType: "MOBILE_NO", routingValue: parsed.data.promptPayId,
    amountMinor: Number(amountMinor), relationship: "EMPLOYEE",
    description: `Employee merchant payment by ${method.employee_name}`,
  }

  try {
    let payout: XenditPayout
    if (!isXenditConfigured()) payout = simulatedXenditPayout(request)
    else {
      try { payout = await createXenditPayout(request) }
      catch (error) {
        if (!isXenditMoneyOutForbidden(error)) throw error
        payout = simulatedXenditPayout(request)
      }
    }
    const providerStatus = payout.status || "ACCEPTED"
    const status = mapXenditStatus(providerStatus)
    const simulated = String(payout.payout_id).startsWith("SIM-XE-")
    const { data, error } = await admin.from("sancus_xendit_payouts").insert({
      user_id: method.user_id, idempotency_key: idempotencyKey, purpose: "EMPLOYEE_SPEND",
      employee_id: user.id, spending_method_id: method.id, employee_name: method.employee_name,
      country: "TH", rail: "PROMPTPAY", currency: "THB", recipient_name: parsed.data.recipientName,
      account_number_masked: maskAccountNumber(parsed.data.promptPayId), routing_type: "MOBILE_NO",
      routing_value: parsed.data.promptPayId, amount_minor: Number(amountMinor),
      description: `QR merchant payment · ${parsed.data.qrPayload.slice(0, 24)}`,
      provider_transaction_id: payout.payout_id, provider_status: providerStatus, status,
      failure_reason: payout.failure_code || null, provider_payload: sanitizeXenditPayout(payout), simulated,
      settled_at: status === "SETTLED" ? payout.updated || new Date().toISOString() : null,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Payment was created but could not be saved" }, { status: 500 })
    return NextResponse.json({ payout: toXenditPayoutDto(data as XenditPayoutRow) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PromptPay payment failed" }, { status: 502 })
  }
})
