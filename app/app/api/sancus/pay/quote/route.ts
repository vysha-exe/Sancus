// Sancus: "You send / They get" quote for non-Singapore rails (USDC, ACH, Wire, Pix, SEPA, SPEI).
// POST { rail, currency?, side: "send" | "receive", amount } → amounts in USDC and the payout currency.
// Converted currencies use live reference rates (lib/sancus/live-fx.ts). No account data involved,
// so it also serves the signed-out demo.
import { NextResponse } from "next/server"
import { z } from "zod"
import { FX_SOURCE_LABEL, getLiveRates, toRateMicro } from "@/lib/sancus/live-fx"
import { defaultCurrency, isPayRail, quotePay, serializePayQuote, type PayCurrency } from "@/lib/sancus/pay-quote"

const schema = z.object({
  rail: z.string().refine(isPayRail, "Unsupported rail"),
  currency: z.enum(["USDC", "USD", "BRL", "EUR", "MXN"]).optional(),
  side: z.enum(["send", "receive"]),
  amount: z.string().max(24),
})

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
  const { rail, currency, side, amount } = parsed.data
  if (!isPayRail(rail)) return NextResponse.json({ error: "Unsupported rail" }, { status: 400 })
  const cur = (currency as PayCurrency | undefined) ?? defaultCurrency(rail)
  const converted = cur !== "USDC" && cur !== "USD"
  const live = converted ? await getLiveRates() : null
  const liveRate = live?.rates[cur]
  const result = quotePay({ rail, currency: cur, side, amount, rateMicro: liveRate ? toRateMicro(liveRate) : undefined })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  const quote = serializePayQuote(result.quote)
  return NextResponse.json({
    quote: {
      ...quote,
      rateSource: live?.source ?? null,
      rateAsOf: live?.asOf ?? null,
      rateLabel: live ? `${quote.rateLabel} · ${FX_SOURCE_LABEL[live.source]}` : quote.rateLabel,
    },
  })
}
