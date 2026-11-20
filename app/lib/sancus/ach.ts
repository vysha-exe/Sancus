// Sancus: US ACH off-ramp. Pure logic (no I/O): recipient validation, quotes, settlement modes,
// ledger journals and DTOs. The I/O lives in ach-server.ts; the mock provider in rails/ach-sim.ts.
//
// Settlement modes (ACH_SETTLEMENT_MODE, recorded on every payment so changing it later is safe):
//   MOCK_ONLY           default. No blockchain transaction; the whole off-ramp is simulated, and a
//                       failed or returned ACH simply releases the funds back to the Treasury.
//   TESTNET_SETTLEMENT  real Arc testnet USDC goes to a team-controlled settlement wallet, then the
//                       USD/ACH leg is simulated. That transfer can't be undone, so a failed or
//                       returned ACH becomes a refund owed by the partner, not money back in the Treasury.

import { createHash } from "node:crypto"
import { z } from "zod"
import { displayMinor, parseToMinor, USDC_DECIMALS } from "./money"
import type { Journal, LedgerEntry } from "./ledger"
import { ACH_STEPS, type AchDemoMode, type AchSpeed, type AchStatus, etaLabel, expectedTimes, RETURN_CODES } from "./rails/ach-sim"

export type SettlementMode = "MOCK_ONLY" | "TESTNET_SETTLEMENT"
export const USD_DECIMALS = 2
/** USD cents → USDC minor units (6 dp), 1:1. */
export const usdToUsdcMinor = (usdMinor: bigint) => usdMinor * 10n ** BigInt(USDC_DECIMALS - USD_DECIMALS)

export function settlementModeFromEnv(env: Record<string, string | undefined> = process.env): SettlementMode {
  return env.ACH_SETTLEMENT_MODE?.trim().toUpperCase() === "TESTNET_SETTLEMENT" ? "TESTNET_SETTLEMENT" : "MOCK_ONLY"
}

// ---------- recipients ----------

export const recipientInputSchema = z.object({
  name: z.string().max(140),
  routingNumber: z.string().max(20),
  accountNumber: z.string().max(30),
  accountType: z.enum(["CHECKING", "SAVINGS"]),
  ownerType: z.enum(["INDIVIDUAL", "BUSINESS"]).default("BUSINESS"),
  address: z
    .object({
      line1: z.string().max(140),
      city: z.string().max(80),
      state: z.string().max(2),
      postalCode: z.string().max(10),
    })
    .optional(),
})
export type RecipientInput = z.infer<typeof recipientInputSchema>
export type Issue = { field: string; message: string }

/** ABA routing number checksum: 3·d1 + 7·d2 + d3 + 3·d4 + 7·d5 + d6 + 3·d7 + 7·d8 + d9 ≡ 0 (mod 10). */
export function isValidRoutingNumber(rn: string): boolean {
  if (!/^\d{9}$/.test(rn)) return false
  const d = rn.split("").map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  // First two digits: 00–12 (banks), 21–32 (thrifts), 61–72 (electronic), 80 (traveler's checks)
  const prefix = Number(rn.slice(0, 2))
  const prefixOk = prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix === 80
  return sum % 10 === 0 && prefixOk && rn !== "000000000"
}

/** Mock bank directory (a real integration would call the Fed ACH directory or the provider). */
const BANKS: Record<string, string> = {
  "021000021": "JPMorgan Chase",
  "026009593": "Bank of America",
  "121000248": "Wells Fargo",
  "011401533": "Bank of America (MA)",
  "322271627": "JPMorgan Chase (CA)",
  "111000614": "JPMorgan Chase (TX)",
  "031176110": "Capital One",
  "091000019": "Wells Fargo (MN)",
  "071000013": "JPMorgan Chase (IL)",
  "101089292": "Sancus Test Bank",
}
export const bankName = (rn: string) => BANKS[rn] ?? "US bank (simulated lookup)"

const digits = (s: string) => s.replace(/[\s-]/g, "")

export function validateRecipient(input: RecipientInput): Issue[] {
  const issues: Issue[] = []
  const name = input.name.trim()
  if (name.length < 2) issues.push({ field: "name", message: "Enter the account holder's name" })
  else if (!/^[\p{L}\p{N} .,'&-]+$/u.test(name)) issues.push({ field: "name", message: "Use letters, numbers and . , ' & - only" })
  const rn = digits(input.routingNumber)
  if (!/^\d{9}$/.test(rn)) issues.push({ field: "routingNumber", message: "Routing numbers are 9 digits" })
  else if (!isValidRoutingNumber(rn)) issues.push({ field: "routingNumber", message: "That routing number fails the ABA checksum" })
  const acct = digits(input.accountNumber)
  if (!/^\d{4,17}$/.test(acct)) issues.push({ field: "accountNumber", message: "Account numbers are 4–17 digits" })
  else if (/^0+$/.test(acct)) issues.push({ field: "accountNumber", message: "Account number can't be all zeros" })
  if (input.address) {
    if (!/^[A-Z]{2}$/i.test(input.address.state)) issues.push({ field: "address.state", message: "Use the 2-letter state code" })
    if (!/^\d{5}(-\d{4})?$/.test(input.address.postalCode)) issues.push({ field: "address.postalCode", message: "ZIP is 5 digits (or ZIP+4)" })
  }
  return issues
}

/** We never store full account numbers: last 4 for display, a salted hash to spot duplicates. */
export function accountFingerprint(routingNumber: string, accountNumber: string, salt = process.env.ACH_FINGERPRINT_SALT ?? "sancus-ach"): string {
  return createHash("sha256").update(`${salt}:${digits(routingNumber)}:${digits(accountNumber)}`).digest("hex")
}

export function normaliseRecipient(input: RecipientInput) {
  const rn = digits(input.routingNumber)
  const acct = digits(input.accountNumber)
  return {
    name: input.name.trim().replace(/\s+/g, " "),
    routingNumber: rn,
    bankName: bankName(rn),
    accountLast4: acct.slice(-4),
    accountType: input.accountType,
    ownerType: input.ownerType,
    fingerprint: accountFingerprint(rn, acct),
    address: input.address ? { ...input.address, state: input.address.state.toUpperCase() } : null,
  }
}

// ---------- quotes ----------

export const FEES_USD_MINOR: Record<AchSpeed, bigint> = { STANDARD: 50n, SAME_DAY: 100n } // $0.50 / $1.00
export const LIMITS_USD_MINOR: Record<AchSpeed, bigint> = { STANDARD: 100_000_00n, SAME_DAY: 1_000_000_00n }
export const MIN_USD_MINOR = 1_00n
export const QUOTE_TTL_SECONDS = 60

export const quoteInputSchema = z.object({
  recipientId: z.string().uuid(),
  /** Amount the recipient receives, in USD, e.g. "2500.00" */
  usdAmount: z.string().max(20),
  speed: z.enum(["STANDARD", "SAME_DAY"]).default("STANDARD"),
})

export type AchQuote = {
  usdAmountMinor: bigint
  feeUsdMinor: bigint
  usdcAmountMinor: bigint
  rate: string
  speed: AchSpeed
  etaLabel: string
  settlementMode: SettlementMode
  demoMode: AchDemoMode
  expiresAt: Date
}

export function quoteAch(
  usdAmount: string,
  speed: AchSpeed,
  opts: { settlementMode: SettlementMode; demoMode: AchDemoMode; now?: Date }
): { ok: true; quote: AchQuote } | { ok: false; issues: Issue[] } {
  const usd = parseToMinor(usdAmount, USD_DECIMALS)
  if (usd === null) return { ok: false, issues: [{ field: "usdAmount", message: "Enter a USD amount with up to 2 decimals" }] }
  if (usd < MIN_USD_MINOR) return { ok: false, issues: [{ field: "usdAmount", message: "Minimum ACH payout is $1.00" }] }
  if (usd > LIMITS_USD_MINOR[speed]) {
    return { ok: false, issues: [{ field: "usdAmount", message: `${speed === "SAME_DAY" ? "Same-day" : "Standard"} ACH is capped at $${displayMinor(LIMITS_USD_MINOR[speed], 2, "", 0)} per payment` }] }
  }
  const fee = FEES_USD_MINOR[speed]
  return {
    ok: true,
    quote: {
      usdAmountMinor: usd,
      feeUsdMinor: fee,
      usdcAmountMinor: usdToUsdcMinor(usd + fee),
      rate: "1.0000",
      speed,
      etaLabel: etaLabel(speed, opts.demoMode),
      settlementMode: opts.settlementMode,
      demoMode: opts.demoMode,
      expiresAt: new Date((opts.now ?? new Date()).getTime() + QUOTE_TTL_SECONDS * 1000),
    },
  }
}

export function serializeQuote(q: AchQuote) {
  return {
    usdAmountMinor: q.usdAmountMinor.toString(),
    feeUsdMinor: q.feeUsdMinor.toString(),
    usdcAmountMinor: q.usdcAmountMinor.toString(),
    rate: q.rate,
    speed: q.speed,
    etaLabel: q.etaLabel,
    settlementMode: q.settlementMode,
    demoMode: q.demoMode,
    simulated: true,
    expiresAt: q.expiresAt.toISOString(),
  }
}

// ---------- rows + ledger ----------

export type AchRecipientRow = {
  id: string
  user_id: string
  name: string
  routing_number: string
  bank_name: string
  account_last4: string
  account_type: "CHECKING" | "SAVINGS"
  owner_type: "INDIVIDUAL" | "BUSINESS"
  fingerprint: string
  address: Record<string, string> | null
  created_at: string
}

export type AchPaymentRow = {
  id: string
  user_id: string
  recipient_id: string
  idempotency_key: string
  recipient_name: string
  routing_number: string
  bank_name: string
  account_last4: string
  account_type: "CHECKING" | "SAVINGS"
  speed: AchSpeed
  usd_amount_minor: number | string
  fee_usd_minor: number | string
  usdc_amount_minor: number | string
  reference: string | null
  settlement_mode: SettlementMode
  demo_mode: AchDemoMode
  funded_onchain: boolean
  source_address: string | null
  settlement_address: string | null
  circle_transaction_id: string | null
  tx_hash: string | null
  mint_tx_hash?: string | null
  provider: string
  provider_ref: string
  status: AchStatus
  return_code: string | null
  failure_reason: string | null
  approval_reason: string | null
  approved_at: string | null
  decided_at: string | null
  decided_note: string | null
  submitted_at: string | null
  processed_at: string | null
  returned_at: string | null
  created_at: string
  updated_at: string
}

export const ACH_ACCOUNTS = {
  available: "treasury:available",
  inTransit: "payouts:in_transit",
  fees: "fees:partner",
  external: "external:ach",
  /** USDC sitting with the off-ramp partner (TESTNET_SETTLEMENT only). */
  partner: "partner:ach_settlement",
  /** Refund the partner owes us after a failed/returned ACH it was already funded for. */
  refundDue: "receivable:ach_refunds",
} as const

type LedgerView = { id: string; usdcMinor: bigint; feeUsdcMinor: bigint; name: string; funded: boolean; returnCode: string | null }

export function achLedgerView(row: AchPaymentRow): LedgerView {
  return {
    id: row.id,
    usdcMinor: BigInt(row.usdc_amount_minor),
    feeUsdcMinor: usdToUsdcMinor(BigInt(row.fee_usd_minor)),
    name: row.recipient_name,
    funded: row.funded_onchain,
    returnCode: row.return_code,
  }
}

export type AchLedgerEvent = "created" | "funded" | "completed" | "failed" | "returned" | "rejected"

/** Balanced journal for one ACH event. Where the money sits depends on whether USDC really left. */
export function achJournal(event: AchLedgerEvent, v: LedgerView): Journal {
  const A = v.usdcMinor
  const net = A - v.feeUsdcMinor
  const held = v.funded ? ACH_ACCOUNTS.partner : ACH_ACCOUNTS.inTransit
  const back = v.funded ? ACH_ACCOUNTS.refundDue : ACH_ACCOUNTS.available
  const reason = v.returnCode ? `${v.returnCode} ${RETURN_CODES[v.returnCode] ?? ""}`.trim() : ""
  const e = (account: string, direction: "DEBIT" | "CREDIT", amountMinor: bigint): LedgerEntry => ({ account, direction, amountMinor })
  const base = { sourceType: "ach_payment", sourceId: v.id, event }
  switch (event) {
    case "created":
      return { ...base, memo: `ACH to ${v.name} committed`, entries: [e(ACH_ACCOUNTS.inTransit, "DEBIT", A), e(ACH_ACCOUNTS.available, "CREDIT", A)] }
    case "funded":
      return { ...base, memo: `USDC sent to off-ramp partner for ${v.name}`, entries: [e(ACH_ACCOUNTS.partner, "DEBIT", A), e(ACH_ACCOUNTS.inTransit, "CREDIT", A)] }
    case "completed": {
      const entries = [e(ACH_ACCOUNTS.external, "DEBIT", net), e(held, "CREDIT", A)]
      if (v.feeUsdcMinor > 0n) entries.splice(1, 0, e(ACH_ACCOUNTS.fees, "DEBIT", v.feeUsdcMinor))
      return { ...base, memo: `ACH to ${v.name} settled`, entries }
    }
    case "failed":
      return {
        ...base,
        memo: `ACH to ${v.name} failed${reason ? ` (${reason})` : ""}; ${v.funded ? "refund due from partner" : "funds released"}`,
        entries: [e(back, "DEBIT", A), e(held, "CREDIT", A)],
      }
    case "returned":
      // The fee isn't refunded on a return; the delivered amount comes back.
      return {
        ...base,
        memo: `ACH to ${v.name} returned${reason ? ` (${reason})` : ""}; ${v.funded ? "refund due from partner" : "funds released"}`,
        entries: [e(back, "DEBIT", net), e(ACH_ACCOUNTS.external, "CREDIT", net)],
      }
    case "rejected":
      return { ...base, memo: `ACH to ${v.name} declined by approver; funds released`, entries: [e(ACH_ACCOUNTS.available, "DEBIT", A), e(ACH_ACCOUNTS.inTransit, "CREDIT", A)] }
  }
}

/** Every journal a payment in this state should have (posting is idempotent per event). */
export function achJournalsFor(row: AchPaymentRow): Journal[] {
  const v = achLedgerView(row)
  const events: AchLedgerEvent[] = ["created"]
  if (row.funded_onchain) events.push("funded")
  if (row.status === "PAYMENT_PROCESSED" || row.status === "RETURNED") events.push("completed")
  if (row.status === "RETURNED") events.push("returned")
  if (row.status === "FAILED") events.push("failed")
  if (row.status === "REJECTED") events.push("rejected")
  return events.map((ev) => achJournal(ev, v))
}

// ---------- DTOs ----------

export function toRecipientDto(r: AchRecipientRow) {
  return {
    id: r.id,
    name: r.name,
    routingNumber: r.routing_number,
    bankName: r.bank_name,
    accountLast4: r.account_last4,
    accountMasked: `••••${r.account_last4}`,
    accountType: r.account_type,
    ownerType: r.owner_type,
    rail: "ACH" as const,
    country: "US" as const,
    currency: "USD" as const,
    createdAt: r.created_at,
  }
}

export function achTimeline(row: AchPaymentRow) {
  const startedAt = new Date(row.approved_at ?? row.created_at)
  const t = expectedTimes({ speed: row.speed, demoMode: row.demo_mode, startedAt })
  const reachedIdx = ACH_STEPS.findIndex((s) => s.status === row.status)
  const actual: Partial<Record<AchStatus, string | null>> = {
    CREATED: row.approved_at ?? row.created_at,
    PAYMENT_SUBMITTED: row.submitted_at,
    PAYMENT_PROCESSED: row.processed_at,
  }
  const steps = ACH_STEPS.map((s, i) => ({
    status: s.status,
    label: s.label,
    done: row.status === "RETURNED" ? true : reachedIdx >= i,
    at: actual[s.status] ?? (s.status === "CREATED" ? startedAt.toISOString() : t[s.status as keyof typeof t]?.toISOString() ?? null),
  }))
  if (row.status === "FAILED" || row.status === "RETURNED") {
    steps.push({
      status: row.status,
      label: row.status === "FAILED" ? "Failed, funds coming back" : "Returned by recipient bank",
      done: true,
      at: row.returned_at ?? row.updated_at,
    })
  }
  return {
    simulated: true,
    label: row.demo_mode === "accelerated" ? "Simulated timeline · accelerated demo" : "Simulated timeline · banking days",
    eta: etaLabel(row.speed, row.demo_mode),
    steps,
  }
}

export function toAchPaymentDto(row: AchPaymentRow) {
  return {
    id: row.id,
    rail: "ACH" as const,
    recipient: {
      id: row.recipient_id,
      name: row.recipient_name,
      bankName: row.bank_name,
      routingNumber: row.routing_number,
      accountMasked: `••••${row.account_last4}`,
      accountType: row.account_type,
    },
    speed: row.speed,
    usdAmountMinor: String(row.usd_amount_minor),
    feeUsdMinor: String(row.fee_usd_minor),
    usdcAmountMinor: String(row.usdc_amount_minor),
    reference: row.reference,
    status: row.status,
    returnCode: row.return_code,
    returnReason: row.return_code ? RETURN_CODES[row.return_code] ?? null : null,
    failureReason: row.failure_reason,
    approvalReason: row.approval_reason,
    settlement: {
      mode: row.settlement_mode,
      fundedOnchain: row.funded_onchain,
      txHash: row.tx_hash,
      explorer: row.tx_hash ? `https://explorer.testnet.arc.io/tx/${row.tx_hash}` : null,
      mintTxHash: row.mint_tx_hash ?? null,
      settlementAddress: row.settlement_address,
    },
    provider: row.provider,
    providerRef: row.provider_ref,
    simulated: true,
    timeline: achTimeline(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
export type AchPaymentDto = ReturnType<typeof toAchPaymentDto>
