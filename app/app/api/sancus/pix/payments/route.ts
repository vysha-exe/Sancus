import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { maskPixKey, toPixPaymentDto } from "@/lib/sancus/local-rails"
import { mapPayZuStatus, payPix } from "@/lib/sancus/rails/payzu"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

const schema = z.object({
  purpose: z.enum(["EMPLOYEE_SPEND", "SUPPLIER_PAYMENT"]),
  spendingMethodId: z.string().uuid().optional(),
  employeeId: z.string().max(80).optional(),
  employeeName: z.string().max(120).optional(),
  recipientName: z.string().min(1).max(120),
  amountBrl: z.number().positive().max(5_000),
  qrPayload: z.string().min(20).max(10_000).optional(),
  pixKey: z.string().min(3).max(140).optional(),
  description: z.string().max(140).optional(),
}).refine((value) => Boolean(value.qrPayload) !== Boolean(value.pixKey), { message: "Provide either a Pix QR or Pix key" })

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase.from("sancus_pix_payments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: "Could not load Pix payments" }, { status: 500 })
  return NextResponse.json({ payments: (data ?? []).map(toPixPaymentDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "money.send")
  if (denied) return denied
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key || key.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const { data: replay } = await supabase.from("sancus_pix_payments").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ payment: toPixPaymentDto(replay), replayed: true })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  let spendingMethod: Record<string, unknown> | null = null
  if (parsed.data.purpose === "EMPLOYEE_SPEND") {
    if (!parsed.data.spendingMethodId) return NextResponse.json({ error: "Pix spending access is required" }, { status: 400 })
    const { data } = await supabase.from("sancus_spending_methods").select("*").eq("id", parsed.data.spendingMethodId).eq("user_id", user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: "Pix spending access not found" }, { status: 404 })
    if (data.status !== "ACTIVE") return NextResponse.json({ error: `Declined: Pix access is ${String(data.status).toLowerCase()}` }, { status: 403 })
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0)
    const { data: prior } = await supabase.from("sancus_pix_payments").select("amount_brl_minor").eq("user_id", user.id).eq("spending_method_id", data.id).in("status", ["PENDING", "SETTLED"]).gte("created_at", start.toISOString())
    const used = (prior ?? []).reduce((sum, payment) => sum + BigInt(payment.amount_brl_minor), 0n)
    const requested = BigInt(Math.round(parsed.data.amountBrl * 100))
    if (used + requested > BigInt(data.monthly_limit_minor)) {
      return NextResponse.json({ error: `Declined: exceeds ${data.employee_name}'s monthly Pix limit` }, { status: 403 })
    }
    spendingMethod = data
  }
  try {
    const reference = `sancus-pay-${randomUUID()}`
    const transaction = await payPix({ ...parsed.data, reference })
    const providerStatus = transaction.status || "PENDING"
    const status = mapPayZuStatus(providerStatus)
    const companyId = await workspaceCompany(req, supabase, user.id) // the company paying, if any
    const { data, error } = await supabase.from("sancus_pix_payments").insert({
      user_id: user.id, company_id: companyId, idempotency_key: key, purpose: parsed.data.purpose,
      spending_method_id: spendingMethod?.id || null,
      employee_id: spendingMethod?.employee_id || parsed.data.employeeId || null,
      employee_name: spendingMethod?.employee_name || parsed.data.employeeName || null,
      recipient_name: parsed.data.recipientName, pix_method: parsed.data.qrPayload ? "QR" : "KEY",
      pix_key_masked: maskPixKey(parsed.data.pixKey), amount_brl_minor: Math.round(parsed.data.amountBrl * 100),
      provider_transaction_id: transaction.id, provider_status: providerStatus, status,
      end_to_end_id: transaction.endToEndId || null,
      provider_payload: transaction, simulated: true,
      settled_at: status === "SETTLED" ? transaction.paidAt || new Date().toISOString() : null,
    }).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Pix payment was created, but Sancus could not save it" }, { status: 500 })
    return NextResponse.json({ payment: toPixPaymentDto(data) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PayZu payment failed" }, { status: 502 })
  }
})

