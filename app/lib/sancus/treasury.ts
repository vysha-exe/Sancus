// Sancus: treasury summary.
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

import type { Address } from "viem"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchGatewayBalance, getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { SDK_CHAIN_BY_BLOCKCHAIN } from "@/lib/constants/chains"
import { parseToMinor, USDC_DECIMALS } from "./money"
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
}

/** Loads everything the summary needs for one user. Never throws on balance reads. */
export async function loadTreasuryInputs(supabase: SupabaseClient, userId: string): Promise<TreasuryInputs> {
  const [walletsRes, payoutsRes, ledgerRes] = await Promise.all([
    supabase.from("wallets").select("circle_wallet_id, name, address, blockchain, type").eq("user_id", userId),
    supabase.from("sancus_payouts").select("status, usdc_amount_minor, tx_hash, simulated").eq("user_id", userId),
    supabase.from("sancus_ledger_entries").select("account, direction, amount_minor").eq("user_id", userId),
  ])

  const allWallets = (walletsRes.data ?? []) as {
    circle_wallet_id: string
    name: string | null
    address: string
    blockchain: string
    type: string | null
  }[]
  const spendable = allWallets.filter((w) => w.type !== "gateway_signer" && w.address && w.blockchain)

  // Wallet USDC (sequential: the RPC helper rate-limits itself).
  const wallets: WalletBalance[] = []
  for (const w of spendable) {
    const chain = SDK_CHAIN_BY_BLOCKCHAIN[w.blockchain]
    let usdcMinor: bigint | null = null
    if (chain) {
      try {
        usdcMinor = await withTimeout(getUsdcBalance(w.address as Address, chain), 6000)
      } catch (e) {
        console.error("Treasury: wallet balance read failed", w.address, w.blockchain, e)
      }
    }
    wallets.push({ walletId: w.circle_wallet_id, name: w.name, address: w.address, blockchain: w.blockchain, usdcMinor })
  }

  // Gateway unified balance across every address the user owns.
  let gatewayMinor: bigint | null = 0n
  const addresses = Array.from(new Set(allWallets.map((w) => w.address?.toLowerCase()).filter(Boolean)))
  for (const address of addresses) {
    try {
      const res = await withTimeout(fetchGatewayBalance(address as Address), 6000)
      for (const b of res.balances ?? []) {
        gatewayMinor = (gatewayMinor ?? 0n) + (parseToMinor(String(b.balance), USDC_DECIMALS) ?? 0n)
      }
    } catch (e) {
      console.error("Treasury: Gateway balance read failed", address, e)
      gatewayMinor = null
      break
    }
  }

  return {
    wallets,
    gatewayMinor,
    payouts: (payoutsRes.data ?? []) as PayoutLite[],
    ledgerRows: (ledgerRes.data ?? []) as EntryRow[],
  }
}
