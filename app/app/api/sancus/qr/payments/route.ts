// Sancus QR payments you sent or received, newest first.
import { NextResponse } from "next/server"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { toQrPaymentDto } from "@/lib/sancus/qr-server"

export const GET = withAuth(async (_req, { user }) => {
  const { supabase: admin } = await createAdminContext()
  const { data, error } = await admin
    .from("sancus_qr_payments")
    .select("*")
    .or(`payer_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: "Could not load QR payments" }, { status: 500 })
  return NextResponse.json({ payments: (data ?? []).map((r) => toQrPaymentDto(r, user.id)) })
})
