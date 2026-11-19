import { NextResponse } from "next/server"
import type { Address } from "viem"
import { withAuth } from "@/lib/api/with-auth"
import { getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { getFaceUsdcBalance, mintFaceUsdc } from "@/lib/sancus/face-usdc"
import { resolveRootTreasury, rootTreasuryWallet } from "@/lib/sancus/root-treasury"

const FLOOR = 500_000n

export const POST = withAuth(async (_req, { user, supabase }) => {
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })
  const address = wallet.address as Address
  const [canonical, internal] = await Promise.all([getUsdcBalance(address, "arcTestnet"), getFaceUsdcBalance(address)])
  let fundingTx: string | null = null
  if (internal < FLOOR) fundingTx = await mintFaceUsdc(address, FLOOR - internal, `sancus:treasury-readiness:${root.companyId}:${Date.now()}`)
  return NextResponse.json({
    canonicalUsdc: canonical >= FLOOR,
    internalLiquidity: true,
    canonicalShortfallMinor: canonical < FLOOR ? (FLOOR - canonical).toString() : "0",
    fundingTx,
  })
})
