import { NextResponse } from "next/server"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { toPixPaymentDto } from "@/lib/sancus/local-rails"
import { refreshPixPayment, type PixPaymentRow } from "@/lib/sancus/pix-payments"

export const POST = withAuth(async (req, { user, supabase }) => {
  const account = await loadAccount(supabase, user)
  if (account.type !== "EMPLOYEE") return NextResponse.json({ error: "Employee login required" }, { status: 403 })
  const id = req.nextUrl.pathname.split("/").at(-2)
  const { supabase: admin } = await createAdminContext()
  const { data } = await admin.from("sancus_pix_payments").select("*").eq("id", id).eq("employee_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Pix payment not found" }, { status: 404 })
  try {
    const refreshed = await refreshPixPayment(admin, data as PixPaymentRow)
    return NextResponse.json({ payment: toPixPaymentDto(refreshed) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh Pix payment" }, { status: 502 })
  }
})
