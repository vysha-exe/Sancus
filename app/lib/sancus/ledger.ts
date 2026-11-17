// Sancus: double-entry ledger.
//
// Every money movement is a journal of balanced entries (debits = credits).
// Amounts are USDC minor units (6 decimals). Journals are posted through the
// `sancus_post_journal` database function, which checks the balance and makes
// posting the same event twice a no-op.
//
// Accounts:
//   treasury:available   USDC the business can spend
//   payouts:in_transit   USDC committed to payouts that haven't finished
//   external:<rail>      USDC that left to a recipient on a rail (paynow, fast, …)
//   fees:partner         partner fees paid
//   funding:external     money that came into the treasury from outside

import type { SupabaseClient } from "@supabase/supabase-js"
import { ceilDiv } from "./money"

export type Direction = "DEBIT" | "CREDIT"
export type LedgerEntry = { account: string; direction: Direction; amountMinor: bigint; currency?: string }
export type Journal = {
  sourceType: string
  sourceId: string
  event: string
  memo?: string
  entries: LedgerEntry[]
}

export const ACCOUNTS = {
  available: "treasury:available",
  inTransit: "payouts:in_transit",
  fees: "fees:partner",
  funding: "funding:external",
  external: (rail: string) => `external:${rail.toLowerCase()}`,
} as const

export function isBalanced(entries: LedgerEntry[]): boolean {
  const debit = entries.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amountMinor, 0n)
  const credit = entries.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amountMinor, 0n)
  return entries.length >= 2 && debit === credit && entries.every((e) => e.amountMinor > 0n)
}

export type PayoutForLedger = {
  id: string
  rail: string
  usdcAmountMinor: bigint
  sgdAmountMinor: bigint
  feeSgdMinor: bigint
  recipientName: string
}

/** USDC portion of the payout that paid the partner fee (proportional to the SGD fee). */
export function feeShareUsdc(p: PayoutForLedger): bigint {
  const totalSgd = p.sgdAmountMinor + p.feeSgdMinor
  if (p.feeSgdMinor <= 0n || totalSgd <= 0n) return 0n
  const share = ceilDiv(p.usdcAmountMinor * p.feeSgdMinor, totalSgd)
  return share >= p.usdcAmountMinor ? 0n : share
}

/** Journal for a payout lifecycle event. */
export function payoutJournal(event: "created" | "completed" | "failed" | "rejected", p: PayoutForLedger): Journal {
  const base = { sourceType: "payout", sourceId: p.id, event }
  if (event === "created") {
    return {
      ...base,
      memo: `Payout to ${p.recipientName} committed`,
      entries: [
        { account: ACCOUNTS.inTransit, direction: "DEBIT", amountMinor: p.usdcAmountMinor },
        { account: ACCOUNTS.available, direction: "CREDIT", amountMinor: p.usdcAmountMinor },
      ],
    }
  }
  if (event === "completed") {
    const fee = feeShareUsdc(p)
    const entries: LedgerEntry[] = [
      { account: ACCOUNTS.external(p.rail), direction: "DEBIT", amountMinor: p.usdcAmountMinor - fee },
      { account: ACCOUNTS.inTransit, direction: "CREDIT", amountMinor: p.usdcAmountMinor },
    ]
    if (fee > 0n) entries.splice(1, 0, { account: ACCOUNTS.fees, direction: "DEBIT", amountMinor: fee })
    return { ...base, memo: `Payout to ${p.recipientName} delivered`, entries }
  }
  return {
    ...base,
    memo:
      event === "rejected"
        ? `Payout to ${p.recipientName} declined by approver; funds released`
        : `Payout to ${p.recipientName} failed; funds released`,
    entries: [
      { account: ACCOUNTS.available, direction: "DEBIT", amountMinor: p.usdcAmountMinor },
      { account: ACCOUNTS.inTransit, direction: "CREDIT", amountMinor: p.usdcAmountMinor },
    ],
  }
}

/** Posts a journal. Returns the journal id, or null (and logs) if posting failed. */
export async function postJournal(supabase: SupabaseClient, journal: Journal): Promise<string | null> {
  if (!isBalanced(journal.entries)) {
    console.error("Refusing to post unbalanced journal", journal)
    return null
  }
  const { data, error } = await supabase.rpc("sancus_post_journal", {
    p_source_type: journal.sourceType,
    p_source_id: journal.sourceId,
    p_event: journal.event,
    p_memo: journal.memo ?? null,
    p_entries: journal.entries.map((e) => ({
      account: e.account,
      direction: e.direction,
      amount_minor: e.amountMinor.toString(),
      currency: e.currency ?? "USDC",
    })),
  })
  if (error) {
    console.error("Failed to post journal", journal.sourceType, journal.sourceId, journal.event, error)
    return null
  }
  return data as string
}

export type EntryRow = { account: string; direction: Direction; amount_minor: number | string }

/**
 * Balance per account. Asset/expense-style: balance = debits − credits.
 * (treasury:available goes negative when payouts exceed recorded funding;
 * the treasury summary uses the real onchain balance for totals.)
 */
export function accountBalances(rows: EntryRow[]): Record<string, bigint> {
  const out: Record<string, bigint> = {}
  for (const r of rows) {
    const amt = BigInt(r.amount_minor)
    out[r.account] = (out[r.account] ?? 0n) + (r.direction === "DEBIT" ? amt : -amt)
  }
  return out
}
