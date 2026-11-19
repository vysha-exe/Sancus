import { NextResponse } from "next/server"
import { z } from "zod"
import type { Address } from "viem"
import { withAuth } from "@/lib/api/with-auth"
import { validateJsonBody } from "@/lib/api/validate"
import { executeGatewayMint, signAndSubmitGatewayBurnIntent } from "@/lib/circle/gateway-sdk"
import { parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { resolveRootTreasury, rootTreasuryWallet } from "@/lib/sancus/root-treasury"
import { resolveSeller } from "@/lib/sancus/x402"
import { gatewayMintJournal, postJournal } from "@/lib/sancus/ledger"

const schema = z.object({ amount: z.string().regex(/^\d+(\.\d+)?$/) })

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const root = await resolveRootTreasury(supabase, user)
  if (!root) return NextResponse.json({ error: "Parent treasury access is required" }, { status: 403 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response
  const amount = parseToMinor(parsed.data.amount, USDC_DECIMALS)
  if (!amount || amount <= 2_010_000n) return NextResponse.json({ error: "Gateway moves must exceed the 2.01 USDC testnet fee" }, { status: 400 })
  const [wallet, seller] = await Promise.all([rootTreasuryWallet(supabase, root), resolveSeller()])
  if (!wallet) return NextResponse.json({ error: "Parent treasury wallet not found" }, { status: 409 })
  if (!seller || seller.companyId !== root.companyId) return NextResponse.json({ error: "Parent x402 receiving wallet is not configured" }, { status: 409 })
  const { data: replay } = await supabase.from("sancus_treasury_gateway_moves").select("*").eq("company_id", root.companyId).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ move: replay, replayed: true })
  const { data: intent, error: insertError } = await supabase.from("sancus_treasury_gateway_moves").insert({
    user_id: user.id, company_id: root.companyId, wallet_id: wallet.circle_wallet_id,
    idempotency_key: key, amount_minor: amount.toString(), source_address: seller.payTo,
    destination_address: wallet.address, status: "PENDING",
  }).select("*").single()
  if (insertError || !intent) return NextResponse.json({ error: insertError?.message ?? "Could not create Gateway move" }, { status: 500 })
  try {
    const burn = await signAndSubmitGatewayBurnIntent(user.id, amount, "arcTestnet", "arcTestnet", wallet.address as Address, seller.payTo as Address, root.companyId)
    const mint = await executeGatewayMint(wallet.address as Address, "arcTestnet", burn.attestation, burn.attestationSignature)
    const { data } = await supabase.from("sancus_treasury_gateway_moves").update({ status: "CONFIRMED", gateway_transfer_id: burn.transferId, mint_tx_hash: mint.txHash ?? null }).eq("id", intent.id).select("*").single()
    await postJournal(supabase, gatewayMintJournal(intent.id, amount))
    return NextResponse.json({ move: data })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "Gateway move failed"
    await supabase.from("sancus_treasury_gateway_moves").update({ status: "FAILED", error: message }).eq("id", intent.id)
    return NextResponse.json({ error: message }, { status: 502 })
  }
})
