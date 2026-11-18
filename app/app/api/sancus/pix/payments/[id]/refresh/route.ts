import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toPixPaymentDto } from "@/lib/sancus/local-rails"
import { refreshPixPayment, type PixPaymentRow } from "@/lib/sancus/pix-payments"

export const POST = withAuth(async (req, { user, supabase }) => {
  const id = req.nextUrl.pathname.split("/").at(-2)
  const { data } = await supabase.from("sancus_pix_payments").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
  if (!data) return NextResponse.json({ error: "Pix payment not found" }, { status: 404 })
  try {
    const refreshed = await refreshPixPayment(supabase, data as PixPaymentRow)
    return NextResponse.json({ payment: toPixPaymentDto(refreshed) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not refresh Pix payment" }, { status: 502 })
  }
})

