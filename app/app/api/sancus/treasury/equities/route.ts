import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { executeCircleContract } from "@/lib/circle/gateway-sdk"
import { faceUsdcAddress } from "@/lib/sancus/face-usdc"
import { resolveRootTreasury, rootTreasuryWallet } from "@/lib/sancus/root-treasury"
import { equityAllocationJournal, postJournal } from "@/lib/sancus/ledger"
import { EQUITIES, EQUITY_BROKER, equityBuyQuote, equitySellQuote, treasuryEquityPortfolio, type EquitySymbol } from "@/lib/sancus/treasury-equities"

const schema = z.object({
  action: z.enum(["BUY", "SELL"]),
  symbol: z.enum(["NVDA", "GOOGL"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })
  const portfolio = await treasuryEquityPortfolio(wallet.address)
  const { data: activity } = await supabase.from("sancus_treasury_allocations").select("*").eq("company_id", root.companyId).order("created_at", { ascending: false }).limit(20)
  return NextResponse.json({ portfolio, broker: EQUITY_BROKER, walletId: wallet.circle_wallet_id, activity: activity ?? [] })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })

  const symbol = parsed.data.symbol as EquitySymbol
  const portfolio = await treasuryEquityPortfolio(wallet.address)
  const current = portfolio.find((asset) => asset.symbol === symbol)!
  const quote = parsed.data.action === "BUY"
    ? equityBuyQuote(symbol, parsed.data.amount, BigInt(current.priceMinor))
    : equitySellQuote(symbol, parsed.data.amount, BigInt(current.priceMinor))
  if (parsed.data.action === "SELL" && quote.shares > BigInt(current.balanceAtomic)) {
    return NextResponse.json({ error: "Not enough shares" }, { status: 409 })
  }

  const { data: replay } = await supabase.from("sancus_treasury_allocations").select("*").eq("company_id", root.companyId).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ allocation: replay, replayed: true })
  const { data: intent, error: insertError } = await supabase.from("sancus_treasury_allocations").insert({
    user_id: user.id, company_id: root.companyId, wallet_id: wallet.circle_wallet_id,
    idempotency_key: key, action: parsed.data.action, symbol,
    usdc_amount_minor: quote.usdcMinor.toString(), share_amount_atomic: quote.shares.toString(), status: "PENDING",
  }).select("*").single()
  if (insertError || !intent) return NextResponse.json({ error: insertError?.message ?? "Could not create allocation" }, { status: 500 })

  try {
    let approvalTxHash: string | null = null
    if (parsed.data.action === "BUY") {
      const fUsdc = faceUsdcAddress()
      if (!fUsdc) throw new Error("fUSDC is not configured")
      const approval = await executeCircleContract(wallet.circle_wallet_id, fUsdc, "approve(address,uint256)", [EQUITY_BROKER, quote.usdcMinor.toString()])
      approvalTxHash = approval.txHash ?? null
      const trade = await executeCircleContract(wallet.circle_wallet_id, EQUITY_BROKER, "buy(address,uint256,uint256)", [quote.asset.address, quote.usdcMinor.toString(), quote.shares.toString()])
      const { data } = await supabase.from("sancus_treasury_allocations").update({ status: "CONFIRMED", approval_tx_hash: approvalTxHash, trade_tx_hash: trade.txHash ?? null }).eq("id", intent.id).select("*").single()
      await postJournal(supabase, equityAllocationJournal(intent.id, "BUY", quote.usdcMinor, symbol))
      return NextResponse.json({ allocation: data })
    }
    const trade = await executeCircleContract(wallet.circle_wallet_id, EQUITY_BROKER, "sell(address,uint256,uint256)", [EQUITIES[symbol].address, quote.shares.toString(), quote.usdcMinor.toString()])
    const { data } = await supabase.from("sancus_treasury_allocations").update({ status: "CONFIRMED", trade_tx_hash: trade.txHash ?? null }).eq("id", intent.id).select("*").single()
    await postJournal(supabase, equityAllocationJournal(intent.id, "SELL", quote.usdcMinor, symbol))
    return NextResponse.json({ allocation: data })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "Trade failed"
    await supabase.from("sancus_treasury_allocations").update({ status: "FAILED", error: message }).eq("id", intent.id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
