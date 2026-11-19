// Sancus: approve or decline one payout waiting for approval.
//   approve → payout continues (USDC leg + partner) from the moment of approval
//   decline → payout REJECTED, reserved funds released in the ledger
//
// Who may decide is checkApprover() (approval-rules.ts): an admin of the payment's company who
// didn't ask for it. Requesters may still withdraw (decline) their own. Once allowed, the change is
// written with the service client, because the row belongs to the requester; the money and the
// ledger stay on the requester's books.
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount, requirePermission } from "@/lib/sancus/accounts-server"
import { checkApprover, type Approver } from "@/lib/sancus/approval-rules"
import { notifyRequester } from "@/lib/sancus/approval-notify"
import { serviceClient } from "@/lib/sancus/service-client"
import { toAchPaymentDto, type AchPaymentRow } from "@/lib/sancus/ach"
import { decideAch } from "@/lib/sancus/ach-server"
import { executeInternalTransfer, toInternalTransferDto, type InternalTransferRow } from "@/lib/sancus/internal-transfers"
import { executePayout, syncPayoutLedger, toPayoutDto, type PayoutRow } from "@/lib/sancus/payouts"

const bodySchema = z.object({
  action: z.enum(["approve", "decline"]),
  note: z.string().max(280).optional(),
})

function idFrom(req: NextRequest): string | null {
  const id = req.nextUrl.pathname.split("/").filter(Boolean).pop()
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "approvals.decide")
  if (denied) return denied
  const id = idFrom(req)
  if (!id) return NextResponse.json({ error: "Invalid payout id" }, { status: 400 })

  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { action, note } = parsed.data

  const account = await loadAccount(supabase, user)
  // Visible = mine, or my company's (RLS: members can view company payouts).
  const { data } = await supabase.from("sancus_payouts").select("*").eq("id", id).maybeSingle()
  const row = data as PayoutRow | null
  if (!row) {
    // Not a Singapore payout: maybe an internal treasury transfer.
    const { data: internal } = await supabase.from("sancus_internal_transfers").select("*").eq("id", id).maybeSingle()
    if (internal) {
      const transfer = internal as InternalTransferRow
      if (transfer.status !== "PENDING_APPROVAL") {
        return NextResponse.json({ error: "This transfer was already decided" }, { status: 409 })
      }
      if (transfer.user_id === user.id && action === "approve") {
        return NextResponse.json({ error: "You can't approve your own transfer. Ask another admin." }, { status: 403 })
      }
      const now = new Date().toISOString()
      const { data: claimed } = await supabase
        .from("sancus_internal_transfers")
        .update(
          action === "approve"
            ? { status: "QUEUED", approved_at: now, approved_by: user.id, decided_at: now, decided_note: note?.trim() || null }
            : { status: "DECLINED", decided_at: now, decided_note: note?.trim() || null, failure_reason: note?.trim() || "Declined by approver" }
        )
        .eq("id", id)
        .eq("status", "PENDING_APPROVAL")
        .select("*")
        .maybeSingle()
      if (!claimed) return NextResponse.json({ error: "Someone already decided this transfer" }, { status: 409 })
      const updated = action === "approve"
        ? await executeInternalTransfer(supabase, claimed as InternalTransferRow)
        : (claimed as InternalTransferRow)
      return NextResponse.json({ internalTransfer: toInternalTransferDto(updated) })
    }

    // Maybe a US ACH payment waiting for approval.
    const { data: ach } = await supabase.from("sancus_ach_payments").select("*").eq("id", id).maybeSingle()
    if (!ach) return NextResponse.json({ error: "Payout not found" }, { status: 404 })
    const achRow = ach as AchPaymentRow & { company_id?: string | null }
    const achDenied = deny(account, achRow.user_id, achRow.company_id ?? null, action)
    if (achDenied) return achDenied
    const decided = await decideAch(serviceClient() ?? supabase, user.id, achRow, action, note)
    if (!decided.ok) return NextResponse.json({ error: decided.error, payment: toAchPaymentDto(ach as AchPaymentRow) }, { status: decided.status })
    return NextResponse.json({ payment: toAchPaymentDto(decided.row) })
  }
  if (row.status !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: `This payment was already ${row.status === "REJECTED" ? "declined" : "approved"}`, payout: toPayoutDto(row) },
      { status: 409 }
    )
  }

  const companyId = (row as { company_id?: string | null }).company_id ?? null
  const refused = deny(account, row.user_id, companyId, action)
  if (refused) return refused
  // Authorized above; the row is the requester's, so write it with the service client.
  const db = serviceClient() ?? supabase

  const now = new Date().toISOString()

  // Only move it out of PENDING_APPROVAL if it's still there (guards double clicks / two approvers).
  const { data: claimed, error } = await db
    .from("sancus_payouts")
    .update(
      action === "approve"
        ? { status: "CREATED", approved_at: now, approved_by: user.id, decided_at: now, decided_note: note?.trim() || null }
        : {
            status: "REJECTED",
            decided_at: now,
            decided_note: note?.trim() || null,
            failure_reason: note?.trim() ? `Declined: ${note.trim()}` : "Declined by approver",
          }
    )
    .eq("id", id)
    .eq("status", "PENDING_APPROVAL")
    .select("*")
    .maybeSingle()

  if (error || !claimed) {
    return NextResponse.json({ error: "Someone already decided this payment" }, { status: 409 })
  }

  let updated = claimed as PayoutRow
  if (action === "decline") {
    await syncPayoutLedger(db, updated) // releases the reserved funds
  } else {
    updated = await executePayout(db, row.user_id, updated)
  }

  if (row.user_id !== user.id) {
    await notifyRequester({
      requesterId: row.user_id,
      companyId,
      approved: action === "approve",
      title: action === "approve" ? `Payment to ${row.recipient_name} approved` : `Payment to ${row.recipient_name} declined`,
      body: note?.trim() || (action === "approve" ? "It's on its way." : "The money went back to the balance."),
      payload: { payoutId: row.id },
    })
  }
  return NextResponse.json({ payout: toPayoutDto(updated) })
})

/** 403 unless `account` may decide this payment. Requesters may withdraw (decline) their own. */
function deny(account: Approver, requesterId: string, companyId: string | null, action: "approve" | "decline"): NextResponse | null {
  const check = checkApprover(account, { requesterId, companyId })
  if (check.ok) return null
  if (action === "decline" && check.code === "OWN_REQUEST") return null
  return NextResponse.json({ error: check.error, code: check.code }, { status: check.code === "NOT_YOURS" ? 404 : 403 })
}
