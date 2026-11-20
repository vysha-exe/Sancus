// Sancus QR, pay side step 2: pay a scanned code.
//   POST { code, amount? } + Idempotency-Key → converts the receiver's currency to USDC at the live
//   rate and moves it onchain on Arc from your treasury (personal, or the company / branch you're
//   working in) to the receiver's treasury. Records the payment for both sides with the tx hash.
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody } from "@/lib/api/validate"
import { createAdminContext, withAuth } from "@/lib/api/with-auth"
import { sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"
import { loadAccount } from "@/lib/sancus/accounts-server"
import { faceUsdcEnabled } from "@/lib/sancus/face-usdc"
import { getLiveRates } from "@/lib/sancus/live-fx"
import { personName, QR_DECIMALS, qrCompanyFor, toQrPaymentDto, treasuryAddress } from "@/lib/sancus/qr-server"
import { verifySancusQr } from "@/lib/sancus/sancus-qr"
import { workspaceCompany } from "@/lib/sancus/workspace-server"

const schema = z.object({ code: z.string().min(10).max(2000), amount: z.number().positive().max(1_000_000_000).optional() })

export const POST = withAuth(async (req, { user, supabase }) => {
  const key = req.headers.get("idempotency-key")?.trim()
  if (!key || key.length > 100) return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  const parsed = await validateJsonBody(req, schema)
  if (!parsed.ok) return parsed.response

  const account = await loadAccount(supabase, user)
  if (!account.can("money.send")) return NextResponse.json({ error: "This account can't send money. Ask your admin." }, { status: 403 })
  const v = verifySancusQr(parsed.data.code)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload
  const amount = p.amt ?? parsed.data.amount
  if (!amount) return NextResponse.json({ error: "Enter an amount" }, { status: 400 })

  const { supabase: admin } = await createAdminContext()
  const { data: replay } = await admin.from("sancus_qr_payments").select("*").eq("payer_user_id", user.id).eq("idempotency_key", key).maybeSingle()
  if (replay) return NextResponse.json({ payment: toQrPaymentDto(replay, user.id), replayed: true })

  const payerCompanyId = qrCompanyFor(account, await workspaceCompany(req, supabase, user.id))
  if (p.u === user.id && (p.c ?? null) === payerCompanyId) return NextResponse.json({ error: "That's your own code" }, { status: 400 })

  const [source, destination, live] = await Promise.all([
    treasuryAddress(admin, user.id, payerCompanyId),
    treasuryAddress(admin, p.u, p.c),
    getLiveRates(),
  ])
  if (!source) return NextResponse.json({ error: "Your balance doesn't have a wallet yet" }, { status: 409 })
  if (!destination) return NextResponse.json({ error: `${p.n} can't receive yet (no wallet)` }, { status: 409 })

  const rate = p.cur === "USD" ? 1 : live.rates[p.cur]
  if (!rate) return NextResponse.json({ error: `No live rate for ${p.cur}` }, { status: 503 })
  const decimals = QR_DECIMALS[p.cur]
  const amountMinor = Math.round(amount * 10 ** decimals)
  const usdcMinor = Math.max(1, Math.round((amount / rate) * 1e6))
  const usdc = (usdcMinor / 1e6).toFixed(6)
  const tokenName = faceUsdcEnabled() ? "fUSDC" : "USDC"
  const payerName = payerCompanyId ? account.scopes.find((s) => s.companyId === payerCompanyId)?.companyName ?? personName(user) : personName(user)

  const { data: row, error } = await admin
    .from("sancus_qr_payments")
    .insert({
      payer_user_id: user.id,
      payer_company_id: payerCompanyId,
      payer_name: payerName,
      receiver_user_id: p.u,
      receiver_company_id: p.c,
      receiver_name: p.n,
      idempotency_key: key,
      currency: p.cur,
      amount_minor: amountMinor,
      usdc_amount_minor: usdcMinor,
      rate: String(rate),
      note: p.note ?? null,
      token: tokenName,
      source_address: source,
      destination_address: destination,
    })
    .select("*")
    .single()
  if (error || !row) return NextResponse.json({ error: "Couldn't start the payment" }, { status: 500 })

  try {
    const sent = await sendUsdcOnSameChainWithAppKit({
      sourceBlockchain: "ARC-TESTNET",
      sourceWalletAddress: source,
      recipientAddress: destination,
      amount: usdc,
      token: tokenName,
    })
    const { data: done } = await admin
      .from("sancus_qr_payments")
      .update({ status: "COMPLETED", tx_hash: sent.txHash ?? sent.txId ?? null, mint_tx_hash: sent.mintTxHash ?? null })
      .eq("id", row.id)
      .select("*")
      .single()
    return NextResponse.json({ payment: toQrPaymentDto(done ?? row, user.id) }, { status: 201 })
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Transfer failed"
    await admin.from("sancus_qr_payments").update({ status: "FAILED", failure_reason: reason }).eq("id", row.id)
    return NextResponse.json({ error: `Payment failed: ${reason}` }, { status: 502 })
  }
})
