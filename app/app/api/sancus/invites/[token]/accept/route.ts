// Sancus: accept a team invite by token (signed-in user becomes the member).
import { NextResponse, type NextRequest } from "next/server"
import { withAuth } from "@/lib/api/with-auth"

function tokenFrom(req: NextRequest): string | null {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean)
  const i = parts.indexOf("invites")
  const token = i >= 0 ? parts[i + 1] : undefined
  return token && /^[a-f0-9]{32,64}$/i.test(token) ? token : null
}

export const POST = withAuth(async (req, { user, supabase }) => {
  const token = tokenFrom(req)
  if (!token) return NextResponse.json({ error: "Invalid invite link" }, { status: 400 })

  const { data: id, error } = await supabase.rpc("sancus_accept_invite", { p_token: token })
  if (error || !id) {
    const msg = error?.message ?? ""
    if (/not found|expired/i.test(msg)) {
      return NextResponse.json({ error: "This invite isn't valid anymore" }, { status: 404 })
    }
    console.error("accept invite failed", error)
    return NextResponse.json({ error: "Could not accept invite" }, { status: 500 })
  }

  const { data: member } = await supabase
    .from("sancus_memberships")
    .select("id, company_id, role, status, accepted_at")
    .eq("id", id)
    .maybeSingle()

  await supabase.from("sancus_notifications").insert({
    user_id: user.id,
    type: "invite_accepted",
    payload: { membershipId: id, companyId: member?.company_id },
  })

  return NextResponse.json({ ok: true, membershipId: id, member })
})
