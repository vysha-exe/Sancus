// Sancus: approve or decline one payout waiting for approval.
//   approve → payout continues (USDC leg + partner) from the moment of approval
//   decline → payout REJECTED, reserved funds released in the ledger
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
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
  const id = idFrom(req)
  if (!id) return NextResponse.json({ error: "Invalid payout id" }, { status: 400 })

  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { action, note } = parsed.data

  const { data } = await supabase.from("sancus_payouts").select("*").eq("user_id", user.id).eq("id", id).maybeSingle()
  const row = data as PayoutRow | null
  if (!row) return NextResponse.json({ error: "Payout not found" }, { status: 404 })
  if (row.status !== "PENDING_APPROVAL") {
    return NextResponse.json(
      { error: `This payment was already ${row.status === "REJECTED" ? "declined" : "approved"}`, payout: toPayoutDto(row) },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()

  // Only move it out of PENDING_APPROVAL if it's still there (guards double clicks / two approvers).
  const { data: claimed, error } = await supabase
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
    await syncPayoutLedger(supabase, updated) // releases the reserved funds
  } else {
    updated = await executePayout(supabase, user.id, updated)
  }
  return NextResponse.json({ payout: toPayoutDto(updated) })
})
