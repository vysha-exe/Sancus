// Create a short-lived signed NFC tap payload for the payer's card.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { nfcDeepLink, nfcSigningConfigured, signNfcCardPay } from "@/lib/sancus/nfc-card"

const schema = z.object({
  cardId: z.string().uuid(),
  amount: z.number().positive().max(100_000),
  merchantName: z.string().trim().min(1).max(120).default("NFC merchant"),
})

export const POST = withAuth(async (req, { user }) => {
  if (!nfcSigningConfigured()) {
    return NextResponse.json({ error: "NFC signing isn't configured on the server" }, { status: 503 })
  }
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const { supabase: admin } = await createAdminContext()
  const { data: card } = await admin.from("sancus_cards").select("*").eq("id", parsed.data.cardId).eq("employee_id", user.id).maybeSingle()
  if (!card) return NextResponse.json({ error: "This card isn't yours" }, { status: 404 })
  if (card.status !== "ACTIVE") return NextResponse.json({ error: `Card is ${String(card.status).toLowerCase()}` }, { status: 403 })

  const payerName = String(user.user_metadata?.first_name ?? card.employee_name ?? "Sancus")
  const payload = {
    v: 1 as const,
    kind: "card_pay" as const,
    cardId: card.id as string,
    lastFour: String(card.last_four ?? "0000"),
    amount: parsed.data.amount,
    merchantName: parsed.data.merchantName,
    payerName,
    userId: user.id,
    exp: Date.now() + 2 * 60 * 1000,
  }
  const token = signNfcCardPay(payload)
  return NextResponse.json({
    token,
    deepLink: nfcDeepLink(token),
    payload,
    expiresAt: new Date(payload.exp).toISOString(),
    hint: "Android: open the Sancus NFC Tap companion (or write this token to a tag). Merchant phone scans with Chrome → Accept tap.",
  })
})
