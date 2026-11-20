// Sancus QR payments you sent or received, newest first.
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { toQrPaymentDto } from "@/lib/sancus/qr-server"
import { serviceOrUser } from "@/lib/sancus/service-client"

export const GET = withAuth(async (_req, { user, supabase }) => {
  const db = await serviceOrUser(supabase)
  const { data, error } = await db
    .from("sancus_qr_payments")
    .select("*")
    .or(`payer_user_id.eq.${user.id},receiver_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return NextResponse.json({ error: "Could not load QR payments" }, { status: 500 })
  return NextResponse.json({ payments: (data ?? []).map((r) => toQrPaymentDto(r, user.id)) })
})
