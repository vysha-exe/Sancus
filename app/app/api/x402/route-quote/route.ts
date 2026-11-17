// Sancus: PAID endpoint. Agents pay per call (x402, Circle Gateway on Arc) for the
// cheapest payout route into Asia. No login: the payment is the authorization.
import { NextResponse, type NextRequest } from "next/server"
import { PAID_ENDPOINTS, withX402 } from "@/lib/sancus/x402"
import { routeQuote } from "@/lib/sancus/route-quote"

const endpoint = PAID_ENDPOINTS.find((e) => e.path === "/api/x402/route-quote")!

async function handler(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const result = routeQuote({
    country: sp.get("country"),
    amount: sp.get("amount"),
    recipientType: sp.get("recipientType"),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result.body)
}

export const GET = withX402(endpoint, handler)
