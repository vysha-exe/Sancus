// Sancus: PAID endpoint. Agents pay per call (x402, Circle Gateway on Arc) for the
// cheapest payout route into Asia. No login: the payment is the authorization.
// Uses the same live FX reference rates as the rest of the app.
import { NextResponse, type NextRequest } from "next/server"
import { PAID_ENDPOINTS, withX402 } from "@/lib/sancus/x402"
import { routeQuote } from "@/lib/sancus/route-quote"
import { getLiveRates } from "@/lib/sancus/live-fx"

const endpoint = PAID_ENDPOINTS.find((e) => e.path === "/api/x402/route-quote")!

async function handler(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const live = await getLiveRates()
  const rates =
    live.source === "configured"
      ? {}
      : {
          SANCUS_USD_SGD_RATE: live.rates.SGD!.toFixed(4),
          SANCUS_USD_IDR_RATE: live.rates.IDR!.toFixed(2),
          SANCUS_USD_THB_RATE: live.rates.THB!.toFixed(4),
        }
  const result = routeQuote(
    { country: sp.get("country"), amount: sp.get("amount"), recipientType: sp.get("recipientType") },
    { ...process.env, ...rates }
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ...result.body, rateSource: live.source, rateAsOf: live.asOf })
}

export const GET = withX402(endpoint, handler)
