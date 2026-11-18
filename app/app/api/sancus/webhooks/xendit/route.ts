import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { mapXenditStatus, sanitizeXenditPayout, verifyXenditWebhookToken, type XenditPayout } from "@/lib/sancus/rails/xendit"

type XenditPayoutEvent = { event?: string; data?: XenditPayout }

export async function POST(req: Request) {
  if (!verifyXenditWebhookToken(req.headers.get("x-callback-token"))) {
    return NextResponse.json({ error: "Invalid Xendit webhook token" }, { status: 401 })
  }
  const event = (await req.json().catch(() => null)) as XenditPayoutEvent | null
  const payout = event?.data
  if (!payout?.payout_id || !event?.event?.startsWith("v3_payout.")) {
    return NextResponse.json({ error: "Invalid Xendit payout event" }, { status: 400 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase admin credentials are missing" }, { status: 503 })

  const providerStatus = payout.status || event.event.replace("v3_payout.", "").toUpperCase()
  const status = mapXenditStatus(providerStatus)
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await admin.from("sancus_xendit_payouts").update({
    provider_status: providerStatus,
    status,
    failure_reason: payout.failure_code || null,
    provider_payload: sanitizeXenditPayout(payout),
    settled_at: status === "SETTLED" ? payout.updated || new Date().toISOString() : null,
  }).eq("provider_transaction_id", payout.payout_id)
  if (error) return NextResponse.json({ error: "Could not update Xendit payout" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
