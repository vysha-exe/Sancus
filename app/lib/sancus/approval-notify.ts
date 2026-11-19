// Sancus: tell the right people about approvals. Server only.
//   notifyApprovers  a payment is waiting → every admin of the company except the requester
//   notifyRequester  an admin decided → the person who asked
// Writes go through the service client (people can only insert their own notifications), and a
// failed notification never fails the payment.
import type { SupabaseClient } from "@supabase/supabase-js"
import { serviceClient } from "./service-client"

/** Owners/admins of the company's global account (the only accounts that can approve). */
export async function approverIds(db: SupabaseClient, companyId: string, excludeUserId?: string): Promise<string[]> {
  const { data: company } = await db.from("sancus_companies").select("root_id").eq("id", companyId).maybeSingle()
  const rootId = (company?.root_id as string | undefined) ?? companyId
  const { data } = await db
    .from("sancus_memberships")
    .select("user_id")
    .eq("company_id", rootId)
    .in("role", ["OWNER", "ADMIN"])
    .eq("status", "ACTIVE")
    .not("user_id", "is", null)
  const ids = (data ?? []).map((m) => m.user_id as string).filter((id) => id !== excludeUserId)
  return [...new Set(ids)]
}

type Note = {
  companyId: string | null
  title: string
  body: string
  payload: Record<string, unknown>
}

export async function notifyApprovers(input: Note & { requesterId: string }): Promise<void> {
  const db = serviceClient()
  if (!db) return
  try {
    // Personal payments: the owner is their own approver.
    const recipients = input.companyId ? await approverIds(db, input.companyId, input.requesterId) : [input.requesterId]
    if (recipients.length === 0) return
    const { error } = await db.from("sancus_notifications").insert(
      recipients.map((userId) => ({
        user_id: userId,
        company_id: input.companyId,
        type: "approval.requested",
        category: "approvals",
        priority: "action",
        title: input.title,
        body: input.body,
        link: "/activity/approvals",
        payload: input.payload,
      }))
    )
    if (error) console.error("Failed to notify approvers", error)
  } catch (error) {
    console.error("Failed to notify approvers", error)
  }
}

export async function notifyRequester(input: Note & { requesterId: string; approved: boolean }): Promise<void> {
  const db = serviceClient()
  if (!db) return
  const { error } = await db.from("sancus_notifications").insert({
    user_id: input.requesterId,
    company_id: input.companyId,
    type: input.approved ? "approval.approved" : "approval.declined",
    category: "approvals",
    priority: input.approved ? "info" : "alert",
    title: input.title,
    body: input.body,
    link: "/me",
    payload: input.payload,
  })
  if (error) console.error("Failed to notify requester", error)
}
