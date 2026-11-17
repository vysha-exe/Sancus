// Sancus: shared server-side helpers for Singapore payouts.

import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { parseToMinor, SGD_DECIMALS } from "./money"
import { chooseRail, FAST_LIMIT_SGD_MINOR, normaliseRecipient, validateRecipient, type SgRecipient } from "./paynow"
import { fxConfigFromEnv, quoteSgdPayout, type PayoutQuote } from "./fx"
import { getPayoutProvider, isTerminal, type PayoutStatus } from "./payout-provider"
import { payoutJournal, postJournal, type PayoutForLedger } from "./ledger"
import { formatMinor, USDC_DECIMALS } from "./money"
import { getAppKitSendError, sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"

export const recipientSchema = z.object({
  name: z.string().max(140),
  proxyType: z.enum(["MOBILE", "UEN", "BANK"]),
  proxyValue: z.string().max(40),
  bankCode: z.string().max(11).optional(),
})

export const quoteRequestSchema = z.object({
  recipient: recipientSchema,
  /** Amount the recipient receives, in SGD, as a decimal string, e.g. "2000.00" */
  sgdAmount: z.string().max(20),
})

export type QuoteInput = z.infer<typeof quoteRequestSchema>

export type PreparedPayout =
  | { ok: true; recipient: SgRecipient; quote: PayoutQuote; railReason: string; etaLabel: string }
  | { ok: false; status: number; error: string; issues?: { field: string; message: string }[] }

/** Validates the recipient + amount and computes a fresh quote. Shared by quote and create. */
export function preparePayout(input: QuoteInput): PreparedPayout {
  const recipientErrors = validateRecipient(input.recipient)
  if (recipientErrors.length) {
    return { ok: false, status: 400, error: "Invalid recipient", issues: recipientErrors }
  }
  const sgdMinor = parseToMinor(input.sgdAmount, SGD_DECIMALS)
  if (sgdMinor === null || sgdMinor <= 0n) {
    return { ok: false, status: 400, error: "Enter an SGD amount with up to 2 decimals", issues: [{ field: "amount", message: "Invalid amount" }] }
  }
  if (sgdMinor > FAST_LIMIT_SGD_MINOR) {
    return { ok: false, status: 400, error: "PayNow/FAST payouts are capped at S$200,000 per transfer", issues: [{ field: "amount", message: "Over the S$200,000 limit" }] }
  }
  const recipient = normaliseRecipient(input.recipient)
  const choice = chooseRail(recipient)
  const quote = quoteSgdPayout(sgdMinor, choice.rail, fxConfigFromEnv())
  return { ok: true, recipient, quote, railReason: choice.reason, etaLabel: choice.etaLabel }
}

export type PayoutRow = {
  id: string
  user_id: string
  idempotency_key: string
  recipient_name: string
  proxy_type: "MOBILE" | "UEN" | "BANK"
  proxy_value: string
  bank_code: string | null
  rail: "PAYNOW" | "FAST"
  reference: string | null
  sgd_amount_minor: number | string
  fee_sgd_minor: number | string
  usdc_amount_minor: number | string
  mid_rate: string
  client_rate: string
  spread_bps: number
  source_wallet_id: string | null
  source_address: string | null
  blockchain: string | null
  settlement_address: string | null
  circle_transaction_id: string | null
  tx_hash: string | null
  provider: string
  provider_ref: string | null
  status: PayoutStatus
  simulated: boolean
  failure_reason: string | null
  approval_reason: string | null
  approved_at: string | null
  decided_at: string | null
  decided_note: string | null
  created_at: string
  updated_at: string
}

/**
 * Asks the partner for the latest status of any non-terminal payouts and
 * persists changes. With the simulated provider this is what moves payouts
 * forward, so it runs whenever payouts are read.
 */
export async function refreshPayoutStatuses(supabase: SupabaseClient, rows: PayoutRow[]): Promise<PayoutRow[]> {
  const provider = getPayoutProvider()
  const now = new Date()
  return Promise.all(
    rows.map(async (row) => {
      // Terminal or still waiting for an approver: nothing for the partner to report.
      if (isTerminal(row.status) || row.status === "PENDING_APPROVAL") return row
      const next = await provider.status(
        {
          id: row.id,
          rail: row.rail,
          status: row.status,
          // Approved payouts start their partner timeline at approval time.
          createdAt: new Date(row.approved_at ?? row.created_at),
          sgdAmountMinor: BigInt(row.sgd_amount_minor),
        },
        now
      )
      if (next === row.status) return row
      const failure_reason = next === "FAILED" ? "Recipient bank rejected the transfer (simulated)" : row.failure_reason
      const { data, error } = await supabase
        .from("sancus_payouts")
        .update({ status: next, failure_reason })
        .eq("id", row.id)
        .select("*")
        .single()
      const updated = error || !data ? { ...row, status: next, failure_reason } : (data as PayoutRow)
      if (error || !data) console.error("Failed to update payout status", row.id, error)
      await syncPayoutLedger(supabase, updated)
      return updated
    })
  )
}

function ledgerView(row: PayoutRow): PayoutForLedger {
  return {
    id: row.id,
    rail: row.rail,
    usdcAmountMinor: BigInt(row.usdc_amount_minor),
    sgdAmountMinor: BigInt(row.sgd_amount_minor),
    feeSgdMinor: BigInt(row.fee_sgd_minor),
    recipientName: row.recipient_name,
  }
}

/**
 * Makes sure the ledger reflects a payout's current state. Safe to call
 * repeatedly: each event is posted at most once (the database enforces it).
 */
export async function syncPayoutLedger(supabase: SupabaseClient, row: PayoutRow): Promise<void> {
  const view = ledgerView(row)
  await postJournal(supabase, payoutJournal("created", view))
  if (row.status === "COMPLETED") await postJournal(supabase, payoutJournal("completed", view))
  if (row.status === "FAILED") await postJournal(supabase, payoutJournal("failed", view))
  if (row.status === "REJECTED") await postJournal(supabase, payoutJournal("rejected", view))
}

/** Updates a payout row and returns the fresh copy (falls back to a local merge on error). */
export async function updatePayout(
  supabase: SupabaseClient,
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

/**
 * Moves the money for a payout that's cleared policy (straight away, or after approval):
 *   1. Treasury leg: real USDC transfer on Arc to the partner's settlement address, when configured.
 *   2. Partner leg: hand the payout to the SGD payout provider.
 * Returns the updated row; a failed USDC transfer marks the payout FAILED and releases the funds.
 */
export async function executePayout(supabase: SupabaseClient, userId: string, row: PayoutRow): Promise<PayoutRow> {
  let current = row

  if (current.settlement_address && current.source_address && current.blockchain) {
    const usdcDecimal = formatMinor(BigInt(current.usdc_amount_minor), USDC_DECIMALS)
    try {
      const sent = await sendUsdcOnSameChainWithAppKit({
        sourceBlockchain: current.blockchain,
        sourceWalletAddress: current.source_address,
        recipientAddress: current.settlement_address,
        amount: usdcDecimal,
        token: "USDC",
      })
      current = await updatePayout(supabase, current, {
        circle_transaction_id: sent.txId,
        tx_hash: sent.txHash ?? null,
      })
      // Mirror into the upstream activity feed.
      await supabase.from("transactions").insert({
        user_id: userId,
        amount: Number(usdcDecimal),
        sender_address: current.source_address,
        recipient_address: current.settlement_address,
        tx_hash: sent.txHash ?? null,
        circle_transaction_id: sent.txId,
        blockchain: current.blockchain,
        type: "OUTBOUND",
        currency: "USDC",
        status: "PENDING",
      })
    } catch (error) {
      const mapped = getAppKitSendError(error)
      current = await updatePayout(supabase, current, {
        status: "FAILED",
        failure_reason: `USDC transfer failed: ${mapped.userMessage ?? mapped.error}`,
      })
      await syncPayoutLedger(supabase, current)
      return current
    }
  }

  const { providerRef } = await getPayoutProvider().submit({
    id: current.id,
    rail: current.rail,
    status: current.status,
    createdAt: new Date(current.approved_at ?? current.created_at),
    sgdAmountMinor: BigInt(current.sgd_amount_minor),
  })
  return updatePayout(supabase, current, { provider_ref: providerRef })
}

/** Shape returned to the browser. Minor-unit amounts stay strings to avoid float loss. */
export function toPayoutDto(row: PayoutRow) {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    proxyType: row.proxy_type,
    proxyValue: row.proxy_value,
    bankCode: row.bank_code,
    rail: row.rail,
    reference: row.reference,
    sgdAmountMinor: String(row.sgd_amount_minor),
    feeSgdMinor: String(row.fee_sgd_minor),
    usdcAmountMinor: String(row.usdc_amount_minor),
    clientRate: row.client_rate,
    blockchain: row.blockchain,
    txHash: row.tx_hash,
    circleTransactionId: row.circle_transaction_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    status: row.status,
    simulated: row.simulated,
    failureReason: row.failure_reason,
    approvalReason: row.approval_reason ?? null,
    approvedAt: row.approved_at ?? null,
    decidedAt: row.decided_at ?? null,
    decidedNote: row.decided_note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type PayoutDto = ReturnType<typeof toPayoutDto>
