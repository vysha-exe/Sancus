// Sancus: approval queue. Waiting requests plus recent decisions.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const [waitingRes, decidedRes] = await Promise.all([
    supabase
      .from("sancus_payouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "PENDING_APPROVAL")
      .order("created_at", { ascending: true }), // oldest first
    supabase
      .from("sancus_payouts")
      .select("*")
      .eq("user_id", user.id)
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(50),
  ])

  if (waitingRes.error || decidedRes.error) {
    console.error("Failed to load approvals", waitingRes.error ?? decidedRes.error)
    return NextResponse.json({ error: "Could not load approvals" }, { status: 500 })
  }

  return NextResponse.json({
    waiting: ((waitingRes.data ?? []) as PayoutRow[]).map(toPayoutDto),
    decided: ((decidedRes.data ?? []) as PayoutRow[]).map(toPayoutDto),
  })
})
