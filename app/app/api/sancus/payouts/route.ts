// Sancus: create and list Singapore payouts.
//
// POST flow:
//   1. Validate recipient + amount, compute a fresh quote server-side (never trust client numbers).
//   2. Insert the payout (idempotent on the Idempotency-Key header).
//   3. Treasury leg: if SANCUS_SETTLEMENT_ADDRESS is set, send the USDC from the
//      chosen Circle wallet on Arc to the partner's settlement address (real testnet tx).
//      Otherwise the leg is skipped and the payout is marked simulated.
//   4. Partner leg: hand off to the payout provider (simulated until StraitsX sandbox access).
import { NextResponse } from "next/server"
import { z } from "zod"
import { evmAddressSchema, validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getAppKitSendError, sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"
import { formatRate } from "@/lib/sancus/fx"
import { formatMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { getPayoutProvider } from "@/lib/sancus/payout-provider"
import {
  preparePayout,
  quoteRequestSchema,
  refreshPayoutStatuses,
  syncPayoutLedger,
  toPayoutDto,
  type PayoutRow,
} from "@/lib/sancus/payouts"

const createSchema = quoteRequestSchema.extend({
  sourceWalletId: z.string().min(1).optional(),
  reference: z.string().max(140).optional(),
})

export const GET = withAuth(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("sancus_payouts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Failed to list payouts", error)
    return NextResponse.json({ error: "Could not load payouts" }, { status: 500 })
  }

  const refreshed = await refreshPayoutStatuses(supabase, (data ?? []) as PayoutRow[])
  return NextResponse.json({ payouts: refreshed.map(toPayoutDto) })
})

export const POST = withAuth(async (req, { user, supabase }) => {
  const idempotencyKey = req.headers.get("idempotency-key")?.trim()
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "Missing Idempotency-Key header" }, { status: 400 })
  }

  // Replay: same key returns the original payout and moves no money.
  const existing = await findByKey(supabase, user.id, idempotencyKey)
  if (existing) return NextResponse.json({ payout: toPayoutDto(existing), replayed: true })

  const parsed = await validateJsonBody(req, createSchema)
  if (!parsed.ok) return parsed.response
  const { sourceWalletId, reference } = parsed.data

  const prepared = preparePayout(parsed.data)
  if (!prepared.ok) {
    return NextResponse.json({ error: prepared.error, issues: prepared.issues }, { status: prepared.status })
  }
  const { recipient, quote } = prepared

  const settlementRaw = process.env.SANCUS_SETTLEMENT_ADDRESS?.trim()
  const settlementAddress = settlementRaw && evmAddressSchema.safeParse(settlementRaw).success ? settlementRaw : null

  let sourceWallet: { address: string; blockchain: string } | null = null
  if (sourceWalletId) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("address, blockchain")
      .eq("user_id", user.id)
      .eq("circle_wallet_id", sourceWalletId)
      .single()
    if (!wallet?.blockchain) {
      return NextResponse.json({ error: "Source wallet not found" }, { status: 404 })
    }
    sourceWallet = wallet
  }

  const provider = getPayoutProvider()
  const willSendOnchain = Boolean(settlementAddress && sourceWallet)

  const { data: inserted, error: insertError } = await supabase
    .from("sancus_payouts")
    .insert({
      user_id: user.id,
      idempotency_key: idempotencyKey,
      recipient_name: recipient.name,
      proxy_type: recipient.proxyType,
      proxy_value: recipient.proxyValue,
      bank_code: recipient.bankCode ?? null,
      rail: quote.rail,
      reference: reference?.trim() || null,
      sgd_amount_minor: quote.sgdAmountMinor.toString(),
      fee_sgd_minor: quote.feeSgdMinor.toString(),
      usdc_amount_minor: quote.usdcAmountMinor.toString(),
      mid_rate: formatRate(quote.midRateMicro),
      client_rate: formatRate(quote.clientRateMicro),
      spread_bps: Number(quote.spreadBps),
      source_wallet_id: sourceWalletId ?? null,
      source_address: sourceWallet?.address ?? null,
      blockchain: sourceWallet?.blockchain ?? null,
      settlement_address: settlementAddress,
      provider: provider.name,
      status: "CREATED",
      // Fully real only when both the treasury leg is onchain and the partner is live.
      simulated: provider.simulated || !willSendOnchain,
    })
    .select("*")
    .single()

  if (insertError || !inserted) {
    // Unique violation = a concurrent request with the same key won the race.
    if (insertError?.code === "23505") {
      const raced = await findByKey(supabase, user.id, idempotencyKey)
      if (raced) return NextResponse.json({ payout: toPayoutDto(raced), replayed: true })
    }
    console.error("Failed to create payout", insertError)
    return NextResponse.json({ error: "Could not create payout" }, { status: 500 })
  }

  let row = inserted as PayoutRow
  // Ledger: commit the USDC from available to in-transit.
  await syncPayoutLedger(supabase, row)

  // Treasury leg: real USDC transfer on Arc testnet.
  if (willSendOnchain && sourceWallet && settlementAddress) {
    const usdcDecimal = formatMinor(quote.usdcAmountMinor, USDC_DECIMALS)
    try {
      const sent = await sendUsdcOnSameChainWithAppKit({
        sourceBlockchain: sourceWallet.blockchain,
        sourceWalletAddress: sourceWallet.address,
        recipientAddress: settlementAddress,
        amount: usdcDecimal,
        token: "USDC",
      })
      row = await update(supabase, row, {
        circle_transaction_id: sent.txId,
        tx_hash: sent.txHash ?? null,
      })
      // Mirror into the upstream activity feed.
      await supabase.from("transactions").insert({
        user_id: user.id,
        amount: Number(usdcDecimal),
        sender_address: sourceWallet.address,
        recipient_address: settlementAddress,
        tx_hash: sent.txHash ?? null,
        circle_transaction_id: sent.txId,
        blockchain: sourceWallet.blockchain,
        type: "OUTBOUND",
        currency: "USDC",
        status: "PENDING",
      })
    } catch (error) {
      const mapped = getAppKitSendError(error)
      row = await update(supabase, row, {
        status: "FAILED",
        failure_reason: `USDC transfer failed: ${mapped.userMessage ?? mapped.error}`,
      })
      await syncPayoutLedger(supabase, row)
      return NextResponse.json({ payout: toPayoutDto(row) }, { status: 201 })
    }
  }

  // Partner leg.
  const { providerRef } = await provider.submit({
    id: row.id,
    rail: row.rail,
    status: row.status,
    createdAt: new Date(row.created_at),
    sgdAmountMinor: BigInt(row.sgd_amount_minor),
  })
  row = await update(supabase, row, { provider_ref: providerRef })

  return NextResponse.json({ payout: toPayoutDto(row) }, { status: 201 })
})

async function findByKey(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  userId: string,
  key: string
): Promise<PayoutRow | null> {
  const { data } = await supabase
    .from("sancus_payouts")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle()
  return (data as PayoutRow | null) ?? null
}

async function update(
  supabase: Parameters<Parameters<typeof withAuth>[0]>[1]["supabase"],
  row: PayoutRow,
  patch: Partial<PayoutRow>
): Promise<PayoutRow> {
  const { data, error } = await supabase.from("sancus_payouts").update(patch).eq("id", row.id).select("*").single()
  if (error || !data) {
    console.error("Failed to update payout", row.id, error)
    return { ...row, ...patch }
  }
  return data as PayoutRow
}
