// Sancus: loads on-chain + DB inputs for summarizeTreasury.
// Kept separate so Circle/viem stay off the UI compile path.

import type { Address } from "viem"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchGatewayBalance, getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { SDK_CHAIN_BY_BLOCKCHAIN } from "@/lib/constants/chains"
import { parseToMinor, USDC_DECIMALS } from "./money"
import type { EntryRow } from "./ledger"
import { BALANCE_SINCE, simulatedSpend, type PayoutLite, type SimSpendInputs, type TreasuryInputs, type WalletBalance } from "./treasury"
import { getLiveRates, toRateMicro } from "./live-fx"

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
}

/**
 * Loads everything the summary needs. Never throws on balance reads.
 *   personal (default): the user's own wallets that belong to no company, plus their Gateway balance,
 *                       payouts and ledger (payouts are funded from the personal Treasury today)
 *   companyIds:         the wallets of those company nodes only (a company and its branches); no
 *                       Gateway, and only payouts tagged to those companies
 */
export async function loadTreasuryInputs(
  supabase: SupabaseClient,
  userId: string,
  opts: { companyIds?: string[] } = {}
): Promise<TreasuryInputs> {
  const company = opts.companyIds && opts.companyIds.length ? opts.companyIds : null
  const walletsQuery = supabase.from("wallets").select("circle_wallet_id, name, address, blockchain, type")
  const payoutsQuery = supabase.from("sancus_payouts").select("status, usdc_amount_minor, tx_hash, simulated, created_at")
  const achQuery = supabase.from("sancus_ach_payments").select("status, usdc_amount_minor, funded_onchain, created_at").gte("created_at", BALANCE_SINCE)
  const pixQuery = supabase.from("sancus_pix_payments").select("status, amount_brl_minor, created_at").gte("created_at", BALANCE_SINCE)
  // Each payment counts in exactly one scope: the company that made it, or personal (no company).
  const [walletsRes, payoutsRes, ledgerRes, achRes, pixRes, bankRes, live] = await Promise.all([
    company ? walletsQuery.in("company_id", company) : walletsQuery.eq("user_id", userId).is("company_id", null),
    company ? payoutsQuery.in("company_id", company) : payoutsQuery.eq("user_id", userId).is("company_id", null),
    company
      ? Promise.resolve({ data: [] as EntryRow[] })
      : supabase.from("sancus_ledger_entries").select("account, direction, amount_minor").eq("user_id", userId),
    company ? achQuery.in("company_id", company) : achQuery.eq("user_id", userId).is("company_id", null),
    company ? pixQuery.in("company_id", company) : pixQuery.eq("user_id", userId).is("company_id", null),
    company
      ? Promise.resolve({ data: null })
      : supabase.from("sancus_personal_bank_accounts").select("balance_minor").eq("user_id", userId).maybeSingle(),
    getLiveRates(),
  ])

  const allWallets = (walletsRes.data ?? []) as {
    circle_wallet_id: string
    name: string | null
    address: string
    blockchain: string
    type: string | null
  }[]
  // The Settlement ("payout") wallet stands in for the off-ramp partner's deposit address: USDC sent
  // there has been paid out, so it isn't part of your balance.
  const spendable = allWallets.filter((w) => w.type !== "gateway_signer" && w.type !== "payout" && w.address && w.blockchain)

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

  // Gateway unified balance across the personal addresses (company wallets don't use Gateway yet).
  let gatewayMinor: bigint | null = 0n
  const addresses = company ? [] : Array.from(new Set(allWallets.map((w) => w.address?.toLowerCase()).filter(Boolean)))
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

  const payouts = (payoutsRes.data ?? []) as (PayoutLite & { created_at: string })[]
  return {
    wallets,
    gatewayMinor,
    // Bank ledgers use cents; treasury summaries use six-decimal USD/USDC units.
    bankMinor: company ? 0n : BigInt(bankRes.data?.balance_minor ?? 0) * 10_000n,
    payouts,
    ledgerRows: (ledgerRes.data ?? []) as EntryRow[],
    simulated: simulatedSpend({
      payouts,
      ach: (achRes.data ?? []) as SimSpendInputs["ach"],
      pix: (pixRes.data ?? []) as SimSpendInputs["pix"],
      brlRateMicro: toRateMicro(live.rates.BRL ?? 5.4123),
    }),
  }
}
