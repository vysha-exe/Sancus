// Sancus: approval queue. Waiting requests plus recent decisions.
//
// Shows your own payments plus company payments for every company you can approve for, so an
// employee's request (or another admin's payment) reaches the admins who can decide it. Each item
// says who asked and whether *you* can decide it (approval-rules.ts): nobody approves their own.
import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { checkApprover, type Approver } from "@/lib/sancus/approval-rules"
import { toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
import { toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"
import { serviceClient } from "@/lib/sancus/service-client"

type Owned = { id: string; user_id: string; company_id?: string | null }

/** user_id = me, or company_id in the companies I approve for. */
function mineOrCompanies(userId: string, companyIds: string[]): string {
  return companyIds.length ? `user_id.eq.${userId},company_id.in.(${companyIds.join(",")})` : `user_id.eq.${userId}`
}

/** First names (or email names) of the people who asked, keyed by user id. */
async function requesterNames(userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const db = serviceClient()
  if (!db) return names
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await db.auth.admin.getUserById(id)
      const u = data?.user
      if (!u) return
      const first = typeof u.user_metadata?.first_name === "string" ? u.user_metadata.first_name.trim() : ""
      names.set(id, first || (u.email?.split("@")[0] ?? "Teammate"))
    })
  )
  return names
}

function decorate<T extends Owned, D>(rows: T[], toDto: (r: T) => D, me: Approver, names: Map<string, string>) {
  return rows.map((row) => {
    const check = checkApprover(me, { requesterId: row.user_id, companyId: row.company_id ?? null })
    return {
      ...toDto(row),
      requester: { name: row.user_id === me.userId ? "You" : names.get(row.user_id) ?? "Teammate", isYou: row.user_id === me.userId },
      canDecide: check.ok,
      cantDecideReason: check.ok ? null : check.error,
    }
  })
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  const companyIds = account.can("approvals.decide") ? account.manageableCompanyIds() : []
  const scope = mineOrCompanies(user.id, companyIds)
  const db: SupabaseClient = supabase

  const [waitingRes, decidedRes, achWaitingRes, achDecidedRes, transferWaitingRes, transferDecidedRes] = await Promise.all([
    db.from("sancus_payouts").select("*").or(scope).eq("status", "PENDING_APPROVAL").order("created_at", { ascending: true }), // oldest first
    db.from("sancus_payouts").select("*").or(scope).not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(50),
    // US ACH payments share the same approval queue.
    db.from("sancus_ach_payments").select("*").or(scope).eq("status", "PENDING_APPROVAL").order("created_at", { ascending: true }),
    db.from("sancus_ach_payments").select("*").or(scope).not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(50),
    db.from("sancus_internal_transfers").select("*").eq("status", "PENDING_APPROVAL").order("created_at", { ascending: true }),
    db.from("sancus_internal_transfers").select("*").not("decided_at", "is", null).order("decided_at", { ascending: false }).limit(50),
  ])

  if (waitingRes.error || decidedRes.error) {
    console.error("Failed to load approvals", waitingRes.error ?? decidedRes.error)
    return NextResponse.json({ error: "Could not load approvals" }, { status: 500 })
  }

  const payoutsWaiting = (waitingRes.data ?? []) as PayoutRow[]
  const payoutsDecided = (decidedRes.data ?? []) as PayoutRow[]
  const achWaiting = (achWaitingRes.data ?? []) as AchPaymentRow[]
  const achDecided = (achDecidedRes.data ?? []) as AchPaymentRow[]
  const others = [...payoutsWaiting, ...payoutsDecided, ...achWaiting, ...achDecided]
    .map((r) => r.user_id)
    .filter((id) => id !== user.id)
  const names = await requesterNames([...new Set(others)])

  const internalWaiting = (transferWaitingRes.data ?? []) as InternalTransferRow[]
  const internalDecided = (transferDecidedRes.data ?? []) as InternalTransferRow[]
  const transferCompanyIds = Array.from(
    new Set([...internalWaiting, ...internalDecided].flatMap((row) => [row.source_company_id, row.destination_company_id]))
  )
  const { data: companies } = transferCompanyIds.length
    ? await supabase.from("sancus_companies").select("id, name").in("id", transferCompanyIds)
    : { data: [] }
  const companyNames = new Map((companies ?? []).map((company) => [company.id as string, company.name as string]))
  const internalDto = (row: InternalTransferRow) =>
    toInternalTransferDto(row, {
      source: companyNames.get(row.source_company_id),
      destination: companyNames.get(row.destination_company_id),
    })

  return NextResponse.json({
    waiting: decorate(payoutsWaiting as (PayoutRow & Owned)[], toPayoutDto, account, names),
    decided: decorate(payoutsDecided as (PayoutRow & Owned)[], toPayoutDto, account, names),
    achWaiting: decorate(achWaiting as (AchPaymentRow & Owned)[], toAchPaymentDto, account, names),
    achDecided: decorate(achDecided as (AchPaymentRow & Owned)[], toAchPaymentDto, account, names),
    internalWaiting: internalWaiting.map(internalDto),
    internalDecided: internalDecided.map(internalDto),
  })
})
