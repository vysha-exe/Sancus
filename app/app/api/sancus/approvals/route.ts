// Sancus: approval queue. Waiting requests plus recent decisions.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
import { toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const [waitingRes, decidedRes, achWaitingRes, achDecidedRes, transferWaitingRes, transferDecidedRes] = await Promise.all([
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
    // US ACH payments share the same approval queue.
    supabase.from("sancus_ach_payments").select("*").eq("user_id", user.id).eq("status", "PENDING_APPROVAL").order("created_at", { ascending: true }),
    supabase.from("sancus_ach_payments").select("*").eq("user_id", user.id).not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(50),
    supabase.from("sancus_internal_transfers").select("*").eq("status", "PENDING_APPROVAL").order("created_at", { ascending: true }),
    supabase.from("sancus_internal_transfers").select("*").not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(50),
  ])

  if (waitingRes.error || decidedRes.error) {
    console.error("Failed to load approvals", waitingRes.error ?? decidedRes.error)
    return NextResponse.json({ error: "Could not load approvals" }, { status: 500 })
  }

  const internalWaiting = (transferWaitingRes.data ?? []) as InternalTransferRow[]
  const internalDecided = (transferDecidedRes.data ?? []) as InternalTransferRow[]
  const companyIds = Array.from(
    new Set([...internalWaiting, ...internalDecided].flatMap((row) => [row.source_company_id, row.destination_company_id]))
  )
  const { data: companies } = companyIds.length
    ? await supabase.from("sancus_companies").select("id, name").in("id", companyIds)
    : { data: [] }
  const names = new Map((companies ?? []).map((company) => [company.id as string, company.name as string]))
  const internalDto = (row: InternalTransferRow) =>
    toInternalTransferDto(row, {
      source: names.get(row.source_company_id),
      destination: names.get(row.destination_company_id),
    })

  return NextResponse.json({
    waiting: ((waitingRes.data ?? []) as PayoutRow[]).map(toPayoutDto),
    decided: ((decidedRes.data ?? []) as PayoutRow[]).map(toPayoutDto),
    achWaiting: ((achWaitingRes.data ?? []) as AchPaymentRow[]).map(toAchPaymentDto),
    achDecided: ((achDecidedRes.data ?? []) as AchPaymentRow[]).map(toAchPaymentDto),
    internalWaiting: internalWaiting.map(internalDto),
    internalDecided: internalDecided.map(internalDto),
  })
})
