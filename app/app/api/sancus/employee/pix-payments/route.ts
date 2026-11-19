import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { useDemoFallback } from "@/lib/sancus/demo-fallback"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"
import { maskPixKey, toPixPaymentDto } from "@/lib/sancus/local-rails"
import { mapPayZuStatus, payPix, simulatedPixPayment } from "@/lib/sancus/rails/payzu"
import { releaseSpendFunds, reserveSpendFunds, settleSpendFunds } from "@/lib/sancus/spend-funding"

const schema = z.object({
  spendingMethodId: z.string().uuid(),
  recipientName: z.string().trim().min(1).max(120),
  amountBrl: z.number().positive().max(5_000),
  qrPayload: z.string().min(20).max(10_000),
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
  const { data, error } = await admin.from("sancus_pix_payments").select("*").eq("employee_id", user.id).order("created_at", { ascending: false }).limit(30)
  if (error) return NextResponse.json({ error: "Could not load Pix payments" }, { status: 500 })
  return NextResponse.json({ payments: (data ?? []).map(toPixPaymentDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { supabase: admin } = await createAdminContext()
  const { data: method } = await admin.from("sancus_spending_methods").select("*").eq("id", parsed.data.spendingMethodId).eq("employee_id", user.id).eq("method_type", "PIX").maybeSingle()
  if (!method) return NextResponse.json({ error: "Pix access is not assigned to your login" }, { status: 404 })
  if (method.status !== "ACTIVE") return NextResponse.json({ error: `Declined: Pix access is ${String(method.status).toLowerCase()}` }, { status: 403 })
  if (!method.company_id || !method.funding_account_id) {
    return NextResponse.json({ error: "This Pix access is not linked to a branch operating bank account" }, { status: 409 })
  }

  const requestedMinor = BigInt(Math.round(parsed.data.amountBrl * 100))
  const [{ data: membership }, { data: monthPayments }, { data: todayPayments }] = await Promise.all([
    admin.from("sancus_memberships").select("per_payment_limit_minor, daily_limit_minor").eq("user_id", user.id).eq("status", "ACTIVE").limit(1).maybeSingle(),
    admin.from("sancus_pix_payments").select("amount_brl_minor").eq("spending_method_id", method.id).in("status", ["PENDING", "SETTLED"]).gte("created_at", startOf("month")),
    admin.from("sancus_pix_payments").select("amount_brl_minor").eq("employee_id", user.id).in("status", ["PENDING", "SETTLED"]).gte("created_at", startOf("day")),
  ])
  const usdMicro = BigInt(Math.round((parsed.data.amountBrl / FIXED_USD_RATES.BRL) * 1_000_000))
  if (membership?.per_payment_limit_minor != null && usdMicro > BigInt(membership.per_payment_limit_minor)) {
    return NextResponse.json({ error: "Declined: this Pix payment exceeds your per-payment limit" }, { status: 403 })
  }
  const monthUsed = (monthPayments ?? []).reduce((sum, payment) => sum + BigInt(payment.amount_brl_minor), 0n)
  if (monthUsed + requestedMinor > BigInt(method.monthly_limit_minor)) {
    return NextResponse.json({ error: "Declined: this payment exceeds your monthly Pix limit" }, { status: 403 })
  }
  const todayBrl = (todayPayments ?? []).reduce((sum, payment) => sum + BigInt(payment.amount_brl_minor), 0n)
  const todayUsdMicro = BigInt(Math.round((Number(todayBrl) / 100 / FIXED_USD_RATES.BRL) * 1_000_000))
  if (membership?.daily_limit_minor != null && todayUsdMicro + usdMicro > BigInt(membership.daily_limit_minor)) {
    return NextResponse.json({ error: "Declined: this Pix payment exceeds your daily limit" }, { status: 403 })
  }
  try {
    const reference = `sancus-employee-pix-${randomUUID()}`
    const holdRef = `pix:${reference}`
    await reserveSpendFunds(admin, {
      accountId: method.funding_account_id,
      amountMinor: requestedMinor,
      ref: holdRef,
      sourceType: "PIX_PAYMENT",
      sourceId: reference,
    })
    const simulated = useDemoFallback("PAYZU_SANDBOX_TOKEN")
    let transaction
    try {
      transaction = simulated
        ? simulatedPixPayment({ amountBrl: parsed.data.amountBrl, reference })
        : await payPix({ amountBrl: parsed.data.amountBrl, reference, qrPayload: parsed.data.qrPayload, description: `Employee purchase by ${method.employee_name}` })
    } catch (error) {
      await releaseSpendFunds(admin, { ref: holdRef })
      throw error
    }
    const providerStatus = transaction.status || "PENDING"
    const status = mapPayZuStatus(providerStatus)
    const terminalFailure = ["FAILED", "EXPIRED", "CANCELLED"].includes(status)
    if (status === "SETTLED") await settleSpendFunds(admin, { ref: holdRef })
    else if (terminalFailure) await releaseSpendFunds(admin, { ref: holdRef })
    const { data, error } = await admin.from("sancus_pix_payments").insert({
      user_id: method.user_id,
      company_id: method.company_id,
      funding_account_id: method.funding_account_id,
      idempotency_key: randomUUID(),
      purpose: "EMPLOYEE_SPEND",
      spending_method_id: method.id,
      employee_id: user.id,
      employee_name: method.employee_name,
      recipient_name: parsed.data.recipientName,
      pix_method: "QR",
      pix_key_masked: maskPixKey(),
      amount_brl_minor: Number(requestedMinor),
      provider_transaction_id: transaction.id,
      provider_status: providerStatus,
      status,
      end_to_end_id: transaction.endToEndId || null,
      provider_payload: transaction,
      simulated,
      settled_at: status === "SETTLED" ? transaction.paidAt || new Date().toISOString() : null,
      funding_status: status === "SETTLED" ? "SETTLED" : terminalFailure ? "RELEASED" : "HELD",
      funding_amount_minor: requestedMinor.toString(), funding_hold_tx_hash: holdRef,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Pix was created, but Sancus could not save it" }, { status: 500 })
    return NextResponse.json({ payment: toPixPaymentDto(data) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Pix payment failed" }, { status: 502 })
  }
})
