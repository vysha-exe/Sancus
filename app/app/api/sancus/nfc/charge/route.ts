// Merchant phone scanned an NFC tap → charge the signed card-pay intent.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { nfcSigningConfigured, verifyNfcCardPay } from "@/lib/sancus/nfc-card"
import { settleNfcCardPurchase } from "@/lib/sancus/nfc-settle"

const schema = z.object({
  token: z.string().min(20).max(4000),
  merchantName: z.string().trim().min(1).max(120).optional(),
})

export const POST = withAuth(async (req) => {
  if (!nfcSigningConfigured()) {
    return NextResponse.json({ error: "NFC signing isn't configured on the server" }, { status: 503 })
  }
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  let intent
  try {
    intent = verifyNfcCardPay(parsed.data.token)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid NFC tap" }, { status: 400 })
  }

  const merchantName = parsed.data.merchantName?.trim() || intent.merchantName
  const { supabase: admin } = await createAdminContext()
  const { data: card } = await admin
    .from("sancus_cards")
    .select("*")
    .eq("id", intent.cardId)
    .eq("employee_id", intent.userId)
    .maybeSingle()
  if (!card) return NextResponse.json({ error: "Card on this tap wasn't found" }, { status: 404 })
  if (card.status !== "ACTIVE") return NextResponse.json({ error: "Card on this tap isn't active" }, { status: 403 })

  const settled = await settleNfcCardPurchase(admin, {
    card,
    payerUserId: intent.userId,
    merchantName,
    amount: intent.amount,
  })
  if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: settled.status })

  return NextResponse.json(
    {
      ok: true,
      purchase: settled.purchase,
      payerName: intent.payerName,
      lastFour: intent.lastFour,
      amount: intent.amount,
      merchantName,
      channel: "nfc",
    },
    { status: 201 }
  )
})
