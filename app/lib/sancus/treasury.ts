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

  const availableMinor = totalMinor - reservedMinor
  if (availableMinor < 0n) warnings.push("Payouts in progress exceed the treasury balance.")

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
