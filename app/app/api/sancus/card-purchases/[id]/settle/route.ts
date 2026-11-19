import { NextResponse } from "next/server"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { requirePermission } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"
import { settleSpendFunds } from "@/lib/sancus/spend-funding"

export const POST = withAuth(async (req, { user, supabase }) => {
  const denied = await requirePermission(supabase, user, "spending.manage")
  if (denied) return denied
  const id = req.nextUrl.pathname.split("/").at(-2)
  const { supabase: admin } = await createAdminContext()
  const { data: purchase } = await admin.from("sancus_card_purchases").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!purchase) return NextResponse.json({ error: "Card purchase not found" }, { status: 404 })
  if (purchase.status !== "HELD") return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(purchase as EmployeeCardPurchaseRow) })
  if (purchase.funding_status !== "HELD") return NextResponse.json({ error: "Card authorization has no active bank hold" }, { status: 409 })
  await settleSpendFunds(admin, { ref: `card:${purchase.id}` })
  const { data, error } = await admin.from("sancus_card_purchases").update({ status: "SETTLED", funding_status: "SETTLED", settled_at: new Date().toISOString() }).eq("id", purchase.id).eq("status", "HELD").select("*").single()
  if (error || !data) return NextResponse.json({ error: "Could not settle the card purchase" }, { status: 500 })
  return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(data as EmployeeCardPurchaseRow) })
})
