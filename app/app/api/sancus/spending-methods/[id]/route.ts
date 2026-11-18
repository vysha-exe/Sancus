import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { toSpendingMethodDto } from "@/lib/sancus/local-rails"
import { requirePermission } from "@/lib/sancus/accounts-server"

const schema = z.object({
  action: z.enum(["pause", "resume", "revoke", "update_limit"]),
  monthlyLimitBrl: z.number().positive().max(50_000).optional(),
  monthlyLimit: z.number().positive().max(250_000_000).optional(),
})

export const PATCH = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const id = req.nextUrl.pathname.split("/").at(-1)
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { data: current } = await supabase.from("sancus_spending_methods").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!current) return NextResponse.json({ error: "Spending method not found" }, { status: 404 })
  if (current.status === "REVOKED") return NextResponse.json({ error: "Revoked access cannot be changed" }, { status: 409 })
  const nextLimit = parsed.data.monthlyLimit ?? parsed.data.monthlyLimitBrl
  const scale = current.currency === "JPY" ? 1 : 100
  const update = parsed.data.action === "update_limit"
    ? nextLimit ? { monthly_limit_minor: Math.round(nextLimit * scale) } : null
    : { status: parsed.data.action === "pause" ? "PAUSED" : parsed.data.action === "resume" ? "ACTIVE" : "REVOKED" }
  if (!update) return NextResponse.json({ error: "A new monthly limit is required" }, { status: 400 })
  const { data, error } = await supabase.from("sancus_spending_methods").update(update).eq("id", id).eq("user_id", user.id).select("*").single()
  if (error || !data) return NextResponse.json({ error: "Could not update Pix access" }, { status: 500 })
  return NextResponse.json({ method: toSpendingMethodDto(data) })
})

