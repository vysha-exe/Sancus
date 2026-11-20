// Sancus QR, pay side step 1: read a scanned code. POST { code } → who you'd pay, in what currency,
// the fixed amount if any, and the live rate to USDC (what leaves your balance).
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getLiveRates } from "@/lib/sancus/live-fx"
import { verifySancusQr } from "@/lib/sancus/sancus-qr"

const schema = z.object({ code: z.string().min(10).max(2000) })

export const POST = withAuth(async (req, { user }) => {
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const v = verifySancusQr(parsed.data.code)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload
  const live = await getLiveRates()
  const rate = p.cur === "USD" ? 1 : live.rates[p.cur] ?? null
  return NextResponse.json({
    receiver: { name: p.n, kind: p.c ? "business" : "personal" },
    currency: p.cur,
    amount: p.amt ?? null,
    note: p.note ?? null,
    rate,
    rateSource: live.source,
    self: p.u === user.id,
  })
})
