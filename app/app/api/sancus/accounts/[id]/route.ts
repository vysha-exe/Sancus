// Sancus: change someone's access. PATCH { status?: "ACTIVE" | "DISABLED", perPaymentLimitMinor?, dailyLimitMinor? }
// Admins can change anyone in their company; branch admins only people in their own branch.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { idFromPath } from "@/lib/sancus/company-api"

const schema = z.object({
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  perPaymentLimitMinor: z.string().regex(/^\d+$/).nullable().optional(),
  dailyLimitMinor: z.string().regex(/^\d+$/).nullable().optional(),
})

export const PATCH = withAuth(async (req, { user, supabase }) => {
  const id = idFromPath(req.nextUrl.pathname, "accounts")
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  const { data: row } = await supabase.from("sancus_memberships").select("id, company_id, user_id, role").eq("id", id).maybeSingle()
  if (!row) return NextResponse.json({ error: "Person not found" }, { status: 404 })
  if (row.user_id === user.id) return NextResponse.json({ error: "You can't change your own access" }, { status: 400 })

  const actor = await loadAccount(supabase, user)
  if (!actor.canManageMembersAt(row.company_id as string)) {
    return NextResponse.json({ error: "You can only manage people in branches you run" }, { status: 403 })
  }
  // A branch admin can't disable or limit another admin of their branch.
  if (actor.type === "BRANCH" && (row.role === "ADMIN" || row.role === "OWNER")) {
    return NextResponse.json({ error: "Only the global admin can change another branch admin" }, { status: 403 })
  }

  const patch: Record<string, string | null> = {}
  if (parsed.data.status) patch.status = parsed.data.status
  if (parsed.data.perPaymentLimitMinor !== undefined) patch.per_payment_limit_minor = parsed.data.perPaymentLimitMinor
  if (parsed.data.dailyLimitMinor !== undefined) patch.daily_limit_minor = parsed.data.dailyLimitMinor
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })

  const { data, error } = await supabase.from("sancus_memberships").update(patch).eq("id", id).select("id, status, per_payment_limit_minor, daily_limit_minor").maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Couldn't save that change" }, { status: 500 })
  return NextResponse.json({
    membershipId: data.id,
    status: data.status,
    perPaymentLimitMinor: data.per_payment_limit_minor != null ? String(data.per_payment_limit_minor) : null,
    dailyLimitMinor: data.daily_limit_minor != null ? String(data.daily_limit_minor) : null,
  })
})
