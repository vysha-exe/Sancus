import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getQrisTransaction, mapQrisStatus, verifyMidtransSignature, type MidtransTransaction } from "@/lib/sancus/rails/midtrans"

export async function POST(req: Request) {
  let notification: MidtransTransaction
  try {
    notification = (await req.json()) as MidtransTransaction
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!verifyMidtransSignature(notification)) {
    return NextResponse.json({ error: "Invalid Midtrans signature" }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase admin credentials are missing" }, { status: 503 })
  if (!notification.order_id) return NextResponse.json({ error: "Missing order_id" }, { status: 400 })

  try {
    // Re-read from Midtrans instead of trusting notification ordering or payload fields.
    const transaction = await getQrisTransaction(notification.order_id)
    const providerStatus = transaction.transaction_status || "pending"
    const status = mapQrisStatus(providerStatus)
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await admin
      .from("sancus_collections")
      .update({
        provider_status: providerStatus,
        status,
        failure_reason: status === "FAILED" ? transaction.status_message || "Payment failed" : null,
        provider_payload: transaction,
        settled_at: status === "SETTLED" ? transaction.settlement_time || new Date().toISOString() : null,
      })
      .eq("provider", "MIDTRANS")
      .eq("provider_transaction_id", transaction.transaction_id)
    if (error) {
      console.error("Failed to reconcile Midtrans webhook", error)
      return NextResponse.json({ error: "Could not update QRIS payment" }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Midtrans reconciliation failed"
    console.error("Midtrans webhook reconciliation failed", message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

