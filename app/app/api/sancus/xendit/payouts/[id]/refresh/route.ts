import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { getXenditPayout, mapXenditStatus, sanitizeXenditPayout } from "@/lib/sancus/rails/xendit"
import { toXenditPayoutDto, type XenditPayoutRow } from "@/lib/sancus/xendit-payouts"

export const POST = withAuth(async (req, { user, supabase }) => {
  const id = req.nextUrl.pathname.split("/").at(-2)
  if (!id) return NextResponse.json({ error: "Missing payout ID" }, { status: 400 })
  const { data: row } = await supabase
    .from("sancus_xendit_payouts")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: "Payout not found" }, { status: 404 })
  try {
    const payout = await getXenditPayout(row.provider_transaction_id)
    const providerStatus = payout.status || row.provider_status
    const status = mapXenditStatus(providerStatus)
    const { data, error } = await supabase.from("sancus_xendit_payouts").update({
      provider_status: providerStatus,
      status,
      failure_reason: payout.failure_code || null,
      provider_payload: sanitizeXenditPayout(payout),
      settled_at: status === "SETTLED" ? payout.updated || new Date().toISOString() : row.settled_at,
    }).eq("id", id).select("*").single()
    if (error || !data) return NextResponse.json({ error: "Could not update payout" }, { status: 500 })
    return NextResponse.json({ payout: toXenditPayoutDto(data as XenditPayoutRow) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Xendit refresh failed" }, { status: 502 })
  }
})
