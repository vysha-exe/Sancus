// Sancus: one ACH payment with its (simulated) timeline. Reading it advances the mock provider.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { refreshAchPayments } from "@/lib/sancus/ach-server"
import { idFromPath } from "@/lib/sancus/company-api"

export const GET = withAuth(async (req, { user, supabase }) => {
  const id = idFromPath(req.nextUrl.pathname, "payments")
  if (!id) return NextResponse.json({ error: "Invalid payment id" }, { status: 400 })
  const { data } = await supabase.from("sancus_ach_payments").select("*").eq("user_id", user.id).eq("id", id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  const [row] = await refreshAchPayments(supabase, [data as AchPaymentRow])
  const { data: events } = await supabase
    .from("sancus_ach_events")
    .select("event_id, event_type, state, received_at")
    .eq("payment_id", id)
    .order("received_at", { ascending: true })
  return NextResponse.json({ payment: toAchPaymentDto(row!), webhookEvents: events ?? [] })
})
