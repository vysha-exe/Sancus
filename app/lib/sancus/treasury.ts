// Sancus: treasury summary (pure math — no Circle/viem imports).
//
// Real balances come from the chain (Circle wallets' USDC via RPC) and from
// Circle Gateway (unified balance). Commitments come from Sancus payouts.
//
//   total      = wallet USDC + Gateway USDC                    (real, onchain)
//   reserved   = in-flight payouts whose USDC hasn't left yet   (still in the treasury)
//   inFlight   = in-flight payouts whose USDC already left      (on its way to the partner)
//   available  = total − reserved
//
// The ledger's payouts:in_transit balance should equal reserved + inFlight;
// if it doesn't, the summary reports the ledger as out of sync.
//
// Chain reads live in treasury-load.ts so UI/tests can import this module
// without pulling viem / Circle into the compile graph.

import { isTerminal, type PayoutStatus } from "./payout-provider"
import { accountBalances, ACCOUNTS, type EntryRow } from "./ledger"

export type WalletBalance = {
  walletId: string
  name: string | null
  address: string
  blockchain: string
  usdcMinor: bigint | null // null = couldn't read
}

export type PayoutLite = {
  status: PayoutStatus
  usdc_amount_minor: number | string
  tx_hash: string | null
  simulated: boolean
}

export type TreasuryInputs = {
  wallets: WalletBalance[]
  gatewayMinor: bigint | null
  payouts: PayoutLite[]
  ledgerRows: EntryRow[]
  /** Money that left on simulated legs (no USDC moved onchain), see simulatedSpend(). */
  simulated?: { spentMinor: bigint; heldMinor: bigint }
}

/**
 * Payments whose money "left" only on a simulated leg don't change the onchain balance, so the
 * balance must take them off itself. Counted from BALANCE_SINCE on, so earlier test payments
 * don't sink a freshly funded demo balance.
 *   spent  = settled simulated payments (SG payouts with no USDC transfer, ACH in mock mode, Pix)
 *   held   = simulated ACH still in progress (reserved until it settles, fails or is returned)
 */
export const BALANCE_SINCE = process.env.SANCUS_BALANCE_SINCE?.trim() || "2026-11-18T08:30:00Z"
const PIX_FEE_USDC_MINOR = 800_000n

export type SimSpendInputs = {
  payouts: (PayoutLite & { created_at?: string })[]
  ach: { status: string; usdc_amount_minor: number | string; funded_onchain: boolean; created_at: string }[]
  pix: { status: string; amount_brl_minor: number | string; created_at: string }[]
  /** BRL per USDC × 1e6, to turn Pix amounts back into USDC. */
  brlRateMicro: bigint
  since?: string
}

export function simulatedSpend(input: SimSpendInputs): { spentMinor: bigint; heldMinor: bigint } {
  const since = Date.parse(input.since ?? BALANCE_SINCE)
  const recent = (at?: string) => !at || Date.parse(at) >= since
  let spentMinor = 0n
  let heldMinor = 0n
  for (const p of input.payouts) {
    if (recent(p.created_at) && p.status === "COMPLETED" && !p.tx_hash) spentMinor += BigInt(p.usdc_amount_minor)
  }
  for (const a of input.ach) {
    if (!recent(a.created_at) || a.funded_onchain) continue // real USDC already left onchain
    const amt = BigInt(a.usdc_amount_minor)
    if (a.status === "PAYMENT_PROCESSED") spentMinor += amt
    else if (["PENDING_APPROVAL", "CREATED", "FUNDS_RECEIVED", "PAYMENT_SUBMITTED"].includes(a.status)) heldMinor += amt
    // FAILED / RETURNED / REJECTED: the money came back
  }
  for (const x of input.pix) {
    if (!recent(x.created_at) || !["SETTLED", "PENDING"].includes(x.status)) continue
    // BRL cents → USDC (6 dp) at the rate, plus the Pix fee
    spentMinor += (BigInt(x.amount_brl_minor) * 10_000n * 1_000_000n) / input.brlRateMicro + PIX_FEE_USDC_MINOR
  }
  return { spentMinor, heldMinor }
}

export function summarizeTreasury(input: TreasuryInputs) {
  const warnings: string[] = []

  const readable = input.wallets.filter((w) => w.usdcMinor !== null)
  if (readable.length < input.wallets.length) {
    warnings.push(`Couldn't read ${input.wallets.length - readable.length} wallet balance(s); totals may be low.`)
  }
  if (input.gatewayMinor === null) warnings.push("Couldn't read the Gateway balance.")
  if (input.wallets.length === 0) warnings.push("No wallets yet. Create an Arc testnet wallet on the Wallets page.")

  const walletsMinor = readable.reduce((s, w) => s + (w.usdcMinor ?? 0n), 0n)
  const gatewayMinor = input.gatewayMinor ?? 0n
  const totalMinor = walletsMinor + gatewayMinor

  let reservedMinor = 0n
  let inFlightMinor = 0n
  let deliveredMinor = 0n
  let simulatedDeliveredMinor = 0n
  let inFlightCount = 0
  for (const p of input.payouts) {
    const amt = BigInt(p.usdc_amount_minor)
    if (!isTerminal(p.status)) {
      inFlightCount++
      if (p.tx_hash) inFlightMinor += amt
      else reservedMinor += amt
    } else if (p.status === "COMPLETED") {
      deliveredMinor += amt
      if (!p.tx_hash) simulatedDeliveredMinor += amt
    }
  }

  // Simulated legs: settled ones are spent, in-progress ones are held like any reserved payout.
  // Floor available at 0 — demo/simulated spends can exceed faucet funds and would otherwise
  // show a negative "Available" (e.g. Pix counted as spent while USDC never left the wallet).
  const simulatedSpentMinor = input.simulated?.spentMinor ?? 0n
  reservedMinor += input.simulated?.heldMinor ?? 0n
  const rawAvailable = totalMinor - reservedMinor - simulatedSpentMinor
  const availableMinor = rawAvailable < 0n ? 0n : rawAvailable
  if (rawAvailable < 0n) warnings.push("Payments exceed the treasury balance.")

  const balances = accountBalances(input.ledgerRows)
  const ledgerInTransit = balances[ACCOUNTS.inTransit] ?? 0n
  const expectedInTransit = reservedMinor + inFlightMinor
  const inSync = ledgerInTransit === expectedInTransit
  if (!inSync) warnings.push("Ledger in-transit balance doesn't match payouts in progress.")

  const str = (v: bigint) => v.toString()
  return {
    totalMinor: str(totalMinor),
    availableMinor: str(availableMinor),
    reservedMinor: str(reservedMinor),
    simulatedSpentMinor: str(simulatedSpentMinor),
    inFlightMinor: str(inFlightMinor),
    walletsMinor: str(walletsMinor),
    gatewayMinor: input.gatewayMinor === null ? null : str(input.gatewayMinor),
    payouts: {
      inFlightCount,
      deliveredMinor: str(deliveredMinor),
      simulatedDeliveredMinor: str(simulatedDeliveredMinor),
    },
    wallets: input.wallets.map((w) => ({
      walletId: w.walletId,
      name: w.name,
      address: w.address,
      blockchain: w.blockchain,
      usdcMinor: w.usdcMinor === null ? null : str(w.usdcMinor),
    })),
    ledger: {
      inSync,
      inTransitMinor: str(ledgerInTransit),
      expectedInTransitMinor: str(expectedInTransit),
      accounts: Object.fromEntries(Object.entries(balances).map(([k, v]) => [k, str(v)])),
    },
    warnings,
    asOf: new Date().toISOString(),
  }
}

export type TreasurySummary = ReturnType<typeof summarizeTreasury>
