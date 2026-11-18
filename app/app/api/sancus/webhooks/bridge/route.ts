// Sancus: off-ramp provider webhooks (Bridge-shaped transfer events, mock signature).
// Verifies X-Webhook-Signature with BRIDGE_WEBHOOK_SECRET, records each event once, applies legal
// state changes only (e.g. a return can only follow settlement), and posts the ledger journals.
import { NextResponse } from "next/server"
import { adminClient, processBridgeEvent, verifyWebhook } from "@/lib/sancus/ach-server"
import type { BridgeEvent } from "@/lib/sancus/rails/ach-sim"

export async function POST(req: Request) {
  const secret = process.env.BRIDGE_WEBHOOK_SECRET?.trim() ?? ""
  if (!secret) return NextResponse.json({ error: "BRIDGE_WEBHOOK_SECRET isn't set" }, { status: 503 })
  const body = await req.text()
  if (!verifyWebhook(body, req.headers.get("x-webhook-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }
  let event: BridgeEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: "Supabase admin credentials are missing" }, { status: 503 })
  const result = await processBridgeEvent(admin, event)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    applied: result.applied,
    note: result.note ?? null,
    status: result.payment?.status ?? null,
  })
}
