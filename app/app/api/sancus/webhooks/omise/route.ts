import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getOmiseCharge, mapOmiseStatus } from "@/lib/sancus/rails/omise"

type OmiseEvent = { id?: string; key?: string; data?: { id?: string } }

export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as OmiseEvent | null
  const chargeId = event?.data?.id
  if (!event || event.key !== "charge.complete" || !chargeId) return NextResponse.json({ ok: true, ignored: true })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase admin credentials are missing" }, { status: 503 })
  try {
    // Omise recommends retrieving the charge instead of trusting the event body.
    const charge = await getOmiseCharge(chargeId)
    const providerStatus = charge.status || "pending"
    const status = mapOmiseStatus(charge)
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await admin.from("sancus_collections").update({
      provider_status: providerStatus, status,
      failure_reason: status === "FAILED" ? charge.failure_message || charge.failure_code || "PromptPay payment failed" : null,
      provider_payload: charge,
      settled_at: status === "SETTLED" ? new Date().toISOString() : null,
    }).eq("provider", "OMISE").eq("provider_transaction_id", chargeId)
    if (error) return NextResponse.json({ error: "Could not update PromptPay collection" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Omise reconciliation failed" }, { status: 502 })
  }
}

