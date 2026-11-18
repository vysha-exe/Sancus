import { NextResponse } from "next/server"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { toEmployeeCardPurchaseDto, type EmployeeCardPurchaseRow } from "@/lib/sancus/employee-spending"

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const id = req.nextUrl.pathname.split("/").at(-2)
  const { supabase: admin } = await createAdminContext()
  const { data: purchase } = await admin.from("sancus_card_purchases").select("*").eq("id", id).eq("employee_id", user.id).maybeSingle()
  if (!purchase) return NextResponse.json({ error: "Card purchase not found" }, { status: 404 })
  if (purchase.status !== "HELD") return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(purchase as EmployeeCardPurchaseRow) })
  const { data, error } = await admin.from("sancus_card_purchases").update({ status: "SETTLED", settled_at: new Date().toISOString() }).eq("id", purchase.id).eq("status", "HELD").select("*").single()
  if (error || !data) return NextResponse.json({ error: "Could not settle the card purchase" }, { status: 500 })
  return NextResponse.json({ purchase: toEmployeeCardPurchaseDto(data as EmployeeCardPurchaseRow) })
})
