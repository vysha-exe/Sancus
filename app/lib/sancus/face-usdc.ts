// Sancus Face USDC (fUSDC): mintable test ERC-20 from the rail bot (MOCK_RAIL_MINTER_KEY).
// Replaces Circle Arc USDC for balances + settlement legs so we can fund unlimited test txs.
// Server only. Deployed by scripts/deploy-mock-stablecoins.mjs → deployments.json faceUsdc.

import { parseUnits, type Address, type Hex } from "viem"
import {
  FACE_USDC,
  faceUsdcBalanceOf,
  faceUsdcBurn,
  faceUsdcMint,
  railBotConfigured,
} from "@/lib/sancus/mock-tokens"

/** On unless SANCUS_FACE_USDC=false, once fUSDC is deployed and the rail bot key is set. */
export function faceUsdcEnabled(): boolean {
  if (process.env.SANCUS_FACE_USDC?.trim().toLowerCase() === "false") return false
  return Boolean(FACE_USDC?.address) && railBotConfigured()
}

export function faceUsdcAddress(): Address | null {
  return FACE_USDC?.address ?? null
}

export function faceUsdcExplorer(): string | null {
  return FACE_USDC?.explorer ?? null
}

export async function getFaceUsdcBalance(address: Address): Promise<bigint> {
  if (!FACE_USDC) throw new Error("Face USDC isn't deployed yet (run scripts/deploy-mock-stablecoins.mjs)")
  return faceUsdcBalanceOf(address)
}

/** Default faucet size: 1,000,000 fUSDC (6 decimals). */
export const FACE_USDC_FAUCET_MINOR = 1_000_000n * 1_000_000n

/** Mint fUSDC to a wallet (bootstrap / faucet). */
export async function mintFaceUsdc(to: Address, amountMinor: bigint, ref: string): Promise<Hex> {
  return faceUsdcMint(to, amountMinor, ref)
}

/**
 * Settlement leg without Circle App Kit: burn from treasury, mint to recipient.
 * Both txs are on Arc testnet; the burn hash is the primary explorer link.
 */
export async function sendFaceUsdc(input: {
  from: Address
  to: Address
  /** Human decimal string, e.g. "12.50" */
  amount: string
  ref: string
}): Promise<{ txId: string; txHash: string; mintTxHash: string }> {
  if (!FACE_USDC) throw new Error("Face USDC isn't deployed")
  const minor = parseUnits(input.amount, FACE_USDC.decimals)
  if (minor <= 0n) throw new Error("Amount must be positive")

  const bal = await faceUsdcBalanceOf(input.from)
  if (bal < minor) {
    // Auto top-up so test flows aren't blocked by empty treasuries.
    await faceUsdcMint(input.from, FACE_USDC_FAUCET_MINOR, `sancus:face-usdc:topup:${input.ref}`)
  }

  // Two Arc transactions: burn from the payer, then mint to the receiver. Both hashes are returned
  // so the Process log can show each leg.
  const burnHash = await faceUsdcBurn(input.from, minor, `sancus:face-usdc:burn:${input.ref}`)
  const mintHash = await faceUsdcMint(input.to, minor, `sancus:face-usdc:mint:${input.ref}`)
  return { txId: burnHash, txHash: burnHash, mintTxHash: mintHash }
}
