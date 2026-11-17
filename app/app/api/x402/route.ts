// Sancus: free discovery. Lists the paid x402 endpoints, prices and payment network
// so agents (or a Bazaar-style index) can find them.
import { NextResponse } from "next/server"
import { ARC_TESTNET_NETWORK, ARC_TESTNET_USDC, PAID_ENDPOINTS, resolveSeller } from "@/lib/sancus/x402"

export async function GET() {
  const seller = await resolveSeller()
  return NextResponse.json({
    name: "Sancus",
    description: "Stablecoin business account for Asia. Paid data for agents that move money.",
    protocol: "x402 v2 (Circle Gateway nanopayments)",
    network: ARC_TESTNET_NETWORK,
    asset: { symbol: "USDC", address: ARC_TESTNET_USDC, decimals: 6 },
    payTo: seller?.payTo ?? null,
    configured: Boolean(seller),
    endpoints: PAID_ENDPOINTS.map((e) => ({
      path: e.path,
      method: e.method,
      price: `${e.price} USDC`,
      description: e.description,
      example: `${e.path}?country=SG&amount=2000&recipientType=UEN`,
    })),
  })
}
