// Sancus: DEVELOPMENT ONLY. Force an ACH failure, return or settlement on one of your payments, sent
// through the real webhook path (signed Bridge-shaped event → /api/sancus/webhooks/bridge) so the
// demo exercises signature checks, de-dupe, state rules and the ledger reversal.
//   POST { outcome: "fail" | "return" | "settle", code?: "R01" | "R02" | ... }
// Disabled in production unless SANCUS_ENABLE_DEV_ENDPOINTS=true.
import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { refreshAchPayments, signWebhook } from "@/lib/sancus/ach-server"
import { idFromPath } from "@/lib/sancus/company-api"
import { bridgeEvent, RETURN_CODES } from "@/lib/sancus/rails/ach-sim"

const schema = z.object({
  outcome: z.enum(["fail", "return", "settle"]),
  code: z.string().regex(/^R\d{2}$/).optional(),
})

const devEndpointsEnabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

export const POST = withAuth(async (req, { user, supabase }) => {
  if (!devEndpointsEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const id = idFromPath(req.nextUrl.pathname, "ach")
  if (!id) return NextResponse.json({ error: "Invalid payment id" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const secret = process.env.BRIDGE_WEBHOOK_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: "BRIDGE_WEBHOOK_SECRET isn't set" }, { status: 503 })

  const { data } = await supabase.from("sancus_ach_payments").select("*").eq("user_id", user.id).eq("id", id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  const [row] = await refreshAchPayments(supabase, [data as AchPaymentRow])

  const { outcome } = parsed.data
  const code = outcome === "settle" ? null : (parsed.data.code ?? (outcome === "fail" ? "R03" : "R01"))
  if (code && !RETURN_CODES[code]) return NextResponse.json({ error: `Unsupported return code ${code}` }, { status: 400 })
  const status = outcome === "fail" ? "FAILED" : outcome === "return" ? "RETURNED" : "PAYMENT_PROCESSED"
  const body = JSON.stringify(bridgeEvent(row!.provider_ref, status, code, `evt_sim_${randomUUID()}`))

  const res = await fetch(new URL("/api/sancus/webhooks/bridge", req.nextUrl.origin), {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-signature": signWebhook(body, secret) },
    body,
  })
  const webhook = await res.json().catch(() => ({}))
  const { data: after } = await supabase.from("sancus_ach_payments").select("*").eq("id", id).maybeSingle()
  return NextResponse.json(
    { webhook: { status: res.status, ...webhook }, payment: after ? toAchPaymentDto(after as AchPaymentRow) : null },
    { status: res.ok ? 200 : res.status }
  )
})
