import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { toSpendingMethodDto } from "@/lib/sancus/local-rails"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { resolveEmployeeFundingAccount } from "@/lib/sancus/spend-funding"

const schema = z.object({
  employeeId: z.string().uuid(),
  companyId: z.string().uuid(),
  employeeName: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  methodType: z.enum(["PIX", "QRIS", "PROMPTPAY", "CARD"]).default("PIX"),
  currency: z.enum(["BRL", "IDR", "THB", "USD"]).optional(),
  monthlyLimit: z.number().positive().max(50_000_000),
  // Back-compat with older Pix-only clients.
  monthlyLimitBrl: z.number().positive().max(50_000).optional(),
})

const providerFor = (t: string) => {
  if (t === "PIX") return "PAYZU"
  if (t === "QRIS") return "MIDTRANS"
  if (t === "PROMPTPAY") return "OMISE"
  return "SIMULATED"
}

const currencyFor = (t: string, override?: string) => {
  if (override) return override
  if (t === "PIX") return "BRL"
  if (t === "QRIS") return "IDR"
  if (t === "PROMPTPAY") return "THB"
  return "USD"
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_spending_methods")
    .select("*")
    .eq("user_id", user.id)
    .neq("status", "REVOKED")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "Could not load spending methods" }, { status: 500 })
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const methods = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: payments } = await supabase
        .from("sancus_pix_payments")
        .select("amount_brl_minor")
        .eq("user_id", user.id)
        .eq("spending_method_id", row.id)
        .in("status", ["PENDING", "SETTLED"])
        .gte("created_at", start.toISOString())
      const used = (payments ?? []).reduce((sum, payment) => sum + BigInt(payment.amount_brl_minor), 0n)
      return toSpendingMethodDto(row, used)
    })
  )
  return NextResponse.json({ methods })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const methodType = parsed.data.methodType
  const currency = currencyFor(methodType, parsed.data.currency)
  const limitMajor = parsed.data.monthlyLimitBrl ?? parsed.data.monthlyLimit
  let funding
  try {
    funding = await resolveEmployeeFundingAccount(supabase, {
      employeeId: parsed.data.employeeId,
      companyId: parsed.data.companyId,
      currency,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resolve the funding account" }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from("sancus_spending_methods")
    .select("id")
    .eq("user_id", user.id)
    .eq("employee_id", parsed.data.employeeId)
    .eq("company_id", funding.companyId)
    .eq("method_type", methodType)
    .neq("status", "REVOKED")
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: `This employee already has ${methodType} spending access` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from("sancus_spending_methods")
    .insert({
      user_id: user.id,
      company_id: funding.companyId,
      funding_account_id: funding.accountId,
      employee_id: parsed.data.employeeId,
      employee_name: parsed.data.employeeName,
      method_type: methodType,
      provider: providerFor(methodType),
      label: parsed.data.label,
      currency,
      monthly_limit_minor: Math.round(limitMajor * 100),
      status: "ACTIVE",
    })
    .select("*")
    .single()
  if (error || !data) {
    console.error("spending method create", error)
    return NextResponse.json({ error: "Could not issue spending access" }, { status: 500 })
  }
  return NextResponse.json({ method: toSpendingMethodDto(data) }, { status: 201 })
})
