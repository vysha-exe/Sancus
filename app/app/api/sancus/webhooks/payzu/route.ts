import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getPixCollection, getPixPayment, mapPayZuStatus } from "@/lib/sancus/rails/payzu"

type PayZuEvent = { id?: string; type?: string }

export async function POST(req: Request) {
  const event = (await req.json().catch(() => null)) as PayZuEvent | null
  if (!event?.id) return NextResponse.json({ error: "Missing PayZu transaction id" }, { status: 400 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase admin credentials are missing" }, { status: 503 })
  try {
    const outbound = event.type?.toUpperCase() === "WITHDRAW"
    const transaction = outbound ? await getPixPayment(event.id) : await getPixCollection(event.id)
    const providerStatus = transaction.status || "PENDING"
    const status = mapPayZuStatus(providerStatus)
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const table = outbound ? "sancus_pix_payments" : "sancus_collections"
    const update: Record<string, unknown> = {
      provider_status: providerStatus, status, provider_payload: transaction,
      failure_reason: status === "FAILED" || status === "CANCELLED" ? transaction.cancellationReason || transaction.message || "Pix transaction failed" : null,
      settled_at: status === "SETTLED" ? transaction.paidAt || new Date().toISOString() : null,
    }
    if (outbound) update.end_to_end_id = transaction.endToEndId || null
    const { error } = await admin.from(table).update(update).eq("provider_transaction_id", event.id)
    if (error) return NextResponse.json({ error: "Could not update Pix transaction" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PayZu reconciliation failed" }, { status: 502 })
  }
}

