// Merchant phone scanned an NFC tap → charge the signed card-pay intent.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { nfcSigningConfigured, verifyNfcCardPay } from "@/lib/sancus/nfc-card"
import { settleNfcCardPurchase } from "@/lib/sancus/nfc-settle"
import { getLiveRates } from "@/lib/sancus/live-fx"

const schema = z.object({
  token: z.string().min(20).max(4000),
  merchantName: z.string().trim().min(1).max(120).optional(),
  /** The receiver's amount, used when the payer tapped without one. */
  amount: z.number().positive().max(100_000_000).optional(),
  /** Currency of `amount` (converted to USD at the live rate). */
  currency: z.enum(["USD", "THB", "IDR", "BRL"]).default("USD"),
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

  // The payer's approved amount wins; otherwise charge what the receiver asked, in USD.
  let amountUsd = intent.amount
  if (amountUsd == null) {
    if (!parsed.data.amount) return NextResponse.json({ error: "Enter the amount to charge" }, { status: 400 })
    const rate = parsed.data.currency === "USD" ? 1 : (await getLiveRates()).rates[parsed.data.currency]
    if (!rate) return NextResponse.json({ error: `No live rate for ${parsed.data.currency}` }, { status: 503 })
    amountUsd = Math.round((parsed.data.amount / rate) * 100) / 100
  }

  const settled = await settleNfcCardPurchase(admin, {
    card,
    payerUserId: intent.userId,
    merchantName,
    amount: amountUsd,
  })
  if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: settled.status })

  return NextResponse.json(
    {
      ok: true,
      purchase: settled.purchase,
      payerName: intent.payerName,
      lastFour: intent.lastFour,
      amount: amountUsd,
      merchantName,
      channel: "nfc",
    },
    { status: 201 }
  )
})
