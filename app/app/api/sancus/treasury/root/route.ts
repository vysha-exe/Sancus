import { NextResponse } from "next/server"
import type { Address } from "viem"
import { withAuth } from "@/lib/api/with-auth"
import { fetchGatewayBalance, getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { faceUsdcAddress, getFaceUsdcBalance } from "@/lib/sancus/face-usdc"
import { parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { resolveRootTreasury, rootGatewaySigner, rootTreasuryWallet } from "@/lib/sancus/root-treasury"
import { provisionRootTreasury } from "@/lib/sancus/root-treasury-provision"

const safe = async (read: () => Promise<bigint>) => {
  try { return await read() } catch { return null }
}

export const GET = withAuth(async (_req, { user, supabase }) => {
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })

  const [wallet, signer] = await Promise.all([
    rootTreasuryWallet(supabase, root),
    rootGatewaySigner(supabase, root),
  ])
  if (!wallet) {
    return NextResponse.json({
      company: { id: root.companyId, name: root.companyName },
      wallet: null,
      gatewaySigner: signer ? { id: signer.circle_wallet_id, address: signer.address, blockchain: signer.blockchain } : null,
      assets: { usdcMinor: "0", gatewayUsdcMinor: "0", fUsdcMinor: "0" },
      earnings: { totalMinor: "0", calls: 0, recent: [] },
      activity: [],
      warnings: ["The parent company does not have an Arc treasury wallet yet."],
    })
  }

  const address = wallet.address as Address
  const gatewayAddress = (signer?.address ?? wallet.address) as Address
  const [usdcMinor, fUsdcMinor, gateway, earnings, gatewayMoves, allocations, yieldActions] = await Promise.all([
    safe(() => getUsdcBalance(address, "arcTestnet")),
    faceUsdcAddress() ? safe(() => getFaceUsdcBalance(address)) : Promise.resolve(null),
    fetchGatewayBalance(gatewayAddress).catch(() => null),
    supabase
      .from("sancus_x402_earnings")
      .select("id, endpoint, payer, amount_minor, gateway_tx, created_at")
      .eq("company_id", root.companyId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("sancus_treasury_gateway_moves").select("id, status, amount_minor, mint_tx_hash, created_at").eq("company_id", root.companyId).order("created_at", { ascending: false }).limit(20),
    supabase.from("sancus_treasury_allocations").select("id, status, action, symbol, usdc_amount_minor, trade_tx_hash, created_at").eq("company_id", root.companyId).order("created_at", { ascending: false }).limit(20),
    supabase.from("sancus_treasury_yield_actions").select("id, status, action, amount, tx_hash, created_at").eq("company_id", root.companyId).order("created_at", { ascending: false }).limit(20),
  ])
  const gatewayMinor = (gateway?.balances ?? []).reduce(
    (sum, item) => sum + (parseToMinor(String(item.balance), USDC_DECIMALS) ?? 0n),
    0n
  )
  const earningRows = earnings.data ?? []
  const earningTotal = earningRows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n)

  const warnings: string[] = []
  if (usdcMinor === null) warnings.push("Canonical USDC could not be read.")
  if (gateway === null) warnings.push("Gateway USDC could not be read.")
  if (fUsdcMinor === null) warnings.push("fUSDC could not be read.")
  if (!signer) warnings.push("The parent company does not have a Gateway signer yet.")
  if (signer && process.env.X402_PAY_TO_ADDRESS?.trim().toLowerCase() !== signer.address.toLowerCase()) {
    warnings.push("The paid agent route is not pointed at this parent company's Gateway signer.")
  }

  return NextResponse.json({
    company: { id: root.companyId, name: root.companyName },
    wallet: { id: wallet.circle_wallet_id, address: wallet.address, name: wallet.name, blockchain: wallet.blockchain },
    gatewaySigner: signer ? { id: signer.circle_wallet_id, address: signer.address, blockchain: signer.blockchain } : null,
    assets: {
      usdcMinor: String(usdcMinor ?? 0n),
      gatewayUsdcMinor: String(gatewayMinor),
      fUsdcMinor: String(fUsdcMinor ?? 0n),
      fUsdcAddress: faceUsdcAddress(),
      gatewayAddress,
      readiness: {
        canonicalUsdc: (usdcMinor ?? 0n) >= 500_000n,
        internalLiquidity: (fUsdcMinor ?? 0n) >= 500_000n,
      },
    },
    earnings: {
      totalMinor: earningTotal.toString(),
      calls: earningRows.length,
      recent: earningRows.slice(0, 10).map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        payer: row.payer,
        amountMinor: String(row.amount_minor),
        gatewayTx: row.gateway_tx,
        createdAt: row.created_at,
      })),
    },
    activity: [
      ...earningRows.map((row) => ({ id: `earning:${row.id}`, kind: "AGENT REVENUE", label: row.endpoint, amount: String(row.amount_minor), currency: "USDC", status: "CONFIRMED", txHash: row.gateway_tx, createdAt: row.created_at })),
      ...(gatewayMoves.data ?? []).map((row) => ({ id: `gateway:${row.id}`, kind: "GATEWAY", label: "Moved into Arc treasury", amount: String(row.amount_minor), currency: "USDC", status: row.status, txHash: row.mint_tx_hash, createdAt: row.created_at })),
      ...(allocations.data ?? []).map((row) => ({ id: `equity:${row.id}`, kind: "ASSET", label: `${row.action} ${row.symbol}`, amount: String(row.usdc_amount_minor), currency: "fUSDC", status: row.status, txHash: row.trade_tx_hash, createdAt: row.created_at })),
      ...(yieldActions.data ?? []).map((row) => ({ id: `yield:${row.id}`, kind: "YIELD", label: row.action, amount: String(parseToMinor(String(row.amount), USDC_DECIMALS) ?? 0n), currency: "USDC", status: row.status, txHash: row.tx_hash, createdAt: row.created_at })),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 20),
    warnings,
  })
})

export const POST = withAuth(async (_req, { user, supabase }) => {
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const result = await provisionRootTreasury(supabase, root)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, { status: result.created.length ? 201 : 200 })
})
