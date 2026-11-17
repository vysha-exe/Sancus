// Sancus: what the signed-in account has earned from x402 calls.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { PAID_ENDPOINTS, resolveSeller } from "@/lib/sancus/x402"

type Row = { id: string; endpoint: string; payer: string; amount_minor: number | string; gateway_tx: string | null; created_at: string }

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_x402_earnings")
    .select("id, endpoint, payer, amount_minor, gateway_tx, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    console.error("Failed to load x402 earnings", error)
    return NextResponse.json({ error: "Could not load earnings" }, { status: 500 })
  }
  const rows = (data ?? []) as Row[]
  const total = rows.reduce((s, r) => s + BigInt(r.amount_minor), 0n)
  const since = Date.now() - 24 * 3600 * 1000
  const today = rows.filter((r) => new Date(r.created_at).getTime() >= since)
  const seller = await resolveSeller()

  return NextResponse.json({
    totalMinor: total.toString(),
    calls: rows.length,
    last24hMinor: today.reduce((s, r) => s + BigInt(r.amount_minor), 0n).toString(),
    last24hCalls: today.length,
    payers: new Set(rows.map((r) => r.payer)).size,
    configured: Boolean(seller),
    payTo: seller?.payTo ?? null,
    endpoints: PAID_ENDPOINTS.map((e) => ({ path: e.path, price: e.price, description: e.description })),
    recent: rows.slice(0, 20).map((r) => ({
      id: r.id,
      endpoint: r.endpoint,
      payer: r.payer,
      amountMinor: String(r.amount_minor),
      gatewayTx: r.gateway_tx,
      createdAt: r.created_at,
    })),
  })
})
