// Shared NFC card-pay settlement (virtual card → Arc local rail).
import type { SupabaseClient } from "@supabase/supabase-js"
import { fundLocalRailOnchain } from "@/lib/sancus/local-rail-onchain"

type CardRow = {
  id: string
  user_id: string
  employee_name: string | null
  company_id: string | null
  funding_account_id: string | null
  monthly_limit_minor: number | string
  status: string
}

export async function settleNfcCardPurchase(
  admin: SupabaseClient,
  opts: {
    card: CardRow
    payerUserId: string
    merchantName: string
    amount: number
  }
): Promise<
  | { ok: true; purchase: Record<string, unknown>; txHash: string | null; mintTxHash: string | null }
  | { ok: false; status: number; error: string }
> {
  const amountMinor = Math.round(opts.amount * 100)
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: month } = await admin
    .from("sancus_card_purchases")
    .select("amount_minor")
    .eq("card_id", opts.card.id)
    .in("status", ["HELD", "SETTLED"])
    .gte("created_at", monthStart.toISOString())
  const used = (month ?? []).reduce((s, p) => s + Number(p.amount_minor), 0)
  const limit = Number(opts.card.monthly_limit_minor)
  if (limit > 0 && used + amountMinor > limit) {
    return { ok: false, status: 403, error: "Declined: over the card's monthly limit" }
  }

  let txHash: string | null = null
  let mintTxHash: string | null = null
  try {
    const onchain = await fundLocalRailOnchain(admin, opts.payerUserId, opts.card.company_id ?? null, {
      currency: "USD",
      amountMinor,
      decimals: 2,
      ref: `nfc-card:${opts.card.id}:${Date.now()}`,
    })
    txHash = onchain?.txHash ?? null
    mintTxHash = onchain?.mintTxHash ?? null
  } catch (error) {
    return {
      ok: false,
      status: 409,
      error: `Declined: ${error instanceof Error ? error.message : "insufficient balance"}`,
    }
  }

  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("sancus_card_purchases")
    .insert({
      user_id: opts.card.user_id,
      employee_id: opts.payerUserId,
      employee_name: opts.card.employee_name,
      card_id: opts.card.id,
      company_id: opts.card.company_id,
      funding_account_id: opts.card.funding_account_id,
      merchant_name: opts.merchantName,
      amount_minor: amountMinor,
      currency: "USD",
      status: "SETTLED",
      settled_at: now,
      provider: "MARQETA",
      simulated: true,
      provider_payload: { txHash, mintTxHash, network: "ARC-TESTNET", channel: "nfc" },
      funding_status: "SETTLED",
      funding_amount_minor: amountMinor,
    })
    .select("*")
    .single()
  if (error || !data) return { ok: false, status: 500, error: "Paid, but the purchase couldn't be saved" }

  return {
    ok: true,
    txHash,
    mintTxHash,
    purchase: {
      id: data.id,
      cardId: opts.card.id,
      merchantName: data.merchant_name,
      amountMinor: String(data.amount_minor),
      currency: data.currency,
      status: data.status,
      txHash,
      mintTxHash,
      createdAt: data.created_at,
      channel: "nfc",
    },
  }
}
