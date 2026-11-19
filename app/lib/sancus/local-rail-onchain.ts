// Optional fUSDC settlement leg for local-rail payouts (Pix, Xendit, …).
// Gives every account type an Arc explorer hash in the Process activity log.
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendUsdcOnSameChainWithAppKit } from "@/lib/circle/app-kit-send"
import { settlementWallets } from "@/lib/sancus/ach-api"
import { faceUsdcEnabled } from "@/lib/sancus/face-usdc"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"

export function localAmountToUsdcString(currency: string, amountMinor: number, decimals: number): string {
  const local = amountMinor / 10 ** decimals
  const rate = FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES] ?? 1
  const usd = local / rate
  if (!Number.isFinite(usd) || usd <= 0) throw new Error("Could not convert local amount to USDC")
  return usd.toFixed(6)
}

export type LocalRailOnchainFunding = {
  txHash: string
  sourceAddress: string
  settlementAddress: string
  usdcAmount: string
}

/** Move fUSDC treasury → settlement (or burn sink) so Process can show an Arc hash. */
export async function fundLocalRailOnchain(
  db: SupabaseClient,
  userId: string,
  companyId: string | null,
  input: { currency: string; amountMinor: number; decimals: number; ref: string }
): Promise<LocalRailOnchainFunding | null> {
  if (!faceUsdcEnabled()) return null
  const wallets = await settlementWallets(db, userId, companyId)
  if (!wallets.treasury) throw new Error("Set up your Treasury wallet before on-chain settlement")
  const settlementAddress = wallets.settlement || process.env.ACH_SETTLEMENT_ADDRESS?.trim() || wallets.treasury
  const usdcAmount = localAmountToUsdcString(input.currency, input.amountMinor, input.decimals)
  const sent = await sendUsdcOnSameChainWithAppKit({
    sourceBlockchain: "ARC-TESTNET",
    sourceWalletAddress: wallets.treasury,
    recipientAddress: settlementAddress,
    amount: usdcAmount,
    token: "fUSDC",
  })
  const txHash = sent.txHash ?? sent.txId
  if (!txHash) throw new Error("On-chain settlement returned no transaction hash")
  return {
    txHash,
    sourceAddress: wallets.treasury,
    settlementAddress,
    usdcAmount,
  }
}
