// Internal: settle an NFC card tap for a known payer (service header required).
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext } from "@/lib/api/with-auth"
import { settleNfcCardPurchase } from "@/lib/sancus/nfc-settle"

const schema = z.object({
  cardId: z.string().uuid(),
  userId: z.string().uuid(),
  merchantName: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100_000),
})

function internalOk(req: NextRequest): boolean {
  const got = req.headers.get("x-sancus-nfc-internal")?.trim() ?? ""
  const expect = (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SANCUS_NFC_SECRET?.trim() || "").slice(0, 64)
  return Boolean(got && expect && got === expect)
}

export async function POST(req: NextRequest) {
  if (!internalOk(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  const { supabase: admin } = await createAdminContext()
  const { data: card } = await admin
    .from("sancus_cards")
    .select("*")
    .eq("id", parsed.data.cardId)
    .eq("employee_id", parsed.data.userId)
    .maybeSingle()
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 })
  if (card.status !== "ACTIVE") return NextResponse.json({ error: "Card isn't active" }, { status: 403 })

  const settled = await settleNfcCardPurchase(admin, {
    card,
    payerUserId: parsed.data.userId,
    merchantName: parsed.data.merchantName,
    amount: parsed.data.amount,
  })
  if (!settled.ok) return NextResponse.json({ error: settled.error }, { status: settled.status })

  return NextResponse.json({ purchase: settled.purchase }, { status: 201 })
}
