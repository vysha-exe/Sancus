import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"

const enabled = () => process.env.NODE_ENV !== "production" || process.env.SANCUS_ENABLE_DEV_ENDPOINTS === "true"

export const GET = withAuth(async (_req, { user, supabase }) => {
  if (!enabled()) return NextResponse.json({ error: "Dev payment tools are disabled" }, { status: 404 })
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const { data, error } = await supabase.from("sancus_dev_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: "Could not load Dev run history", detail: error.message }, { status: 500 })
  return NextResponse.json({ runs: data ?? [] })
})
