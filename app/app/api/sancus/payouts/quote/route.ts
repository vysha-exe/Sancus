// Sancus: quote a Singapore payout (no money moves).
import { NextResponse } from "next/server"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { serializeQuote } from "@/lib/sancus/fx"
import { preparePayout, quoteRequestSchema } from "@/lib/sancus/payouts"
import { liveSgdFxConfig } from "@/lib/sancus/live-fx"

export const POST = withAuth(async (req) => {
  const parsed = await validateJsonBody(req, quoteRequestSchema)
  if (!parsed.ok) return parsed.response

  const prepared = preparePayout(parsed.data, await liveSgdFxConfig())
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, issues: prepared.issues }, { status: prepared.status })
  }

  return NextResponse.json({
    quote: serializeQuote(prepared.quote),
    rail: prepared.quote.rail,
    railReason: prepared.railReason,
    etaLabel: prepared.etaLabel,
  })
})
