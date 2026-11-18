// Sancus: loads on-chain + DB inputs for summarizeTreasury.
// Kept separate so Circle/viem stay off the UI compile path.

import type { Address } from "viem"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchGatewayBalance, getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { SDK_CHAIN_BY_BLOCKCHAIN } from "@/lib/constants/chains"
import { parseToMinor, USDC_DECIMALS } from "./money"
import type { EntryRow } from "./ledger"
import type { PayoutLite, TreasuryInputs, WalletBalance } from "./treasury"

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
