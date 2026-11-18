import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "activity.view")
  if (denied) return denied
  const { data, error } = await supabase.from("sancus_card_purchases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: "Could not load card purchases" }, { status: 500 })
  return NextResponse.json({ purchases: ((data ?? []) as EmployeeCardPurchaseRow[]).map(toEmployeeCardPurchaseDto) })
})
