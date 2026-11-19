// Sancus: the rail bot. Mints / burns mock local stablecoins (mBRL, mIDR, mTHB) and Face USDC
// (fUSDC) on Arc testnet with MOCK_RAIL_MINTER_KEY. Server only.
// Deployed by scripts/deploy-mock-stablecoins.mjs.

import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import artifact from "@/contracts/mock-stablecoin/SancusMockStablecoin.json"
import deployments from "@/contracts/mock-stablecoin/deployments.json"

export type LocalCurrency = "BRL" | "IDR" | "THB"
export type MockToken = {
  currency: LocalCurrency
  symbol: string
  name: string
  decimals: number
  country: string
  rail: string
  address: Address
  explorer: string
}

export type FaceUsdcToken = {
  symbol: string
  name: string
  decimals: number
  address: Address
  explorer: string
  deployTx?: string
}

type DeploymentsFile = {
  tokens: Record<LocalCurrency, MockToken>
  faceUsdc?: FaceUsdcToken | null
}

const deployed = deployments as DeploymentsFile

export const MOCK_TOKENS: Record<LocalCurrency, MockToken> = deployed.tokens
export const LOCAL_CURRENCIES = Object.keys(MOCK_TOKENS) as LocalCurrency[]
/** Face USDC (fUSDC) — mintable stand-in for Circle USDC on Arc testnet. */
export const FACE_USDC: FaceUsdcToken | null = deployed.faceUsdc?.address ? deployed.faceUsdc : null

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
})

function transport() {
  const key = process.env.ARC_TESTNET_RPC_KEY?.trim()
  return http(key ? `https://rpc.testnet.arc.network/${key}` : "https://rpc.testnet.arc.network")
}

let pub: ReturnType<typeof createPublicClient> | null = null
const publicClient = () => (pub ??= createPublicClient({ chain: arcTestnet, transport: transport() }))

export function railBotConfigured(): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(process.env.MOCK_RAIL_MINTER_KEY?.trim() ?? "")
}

function botWallet() {
  const key = process.env.MOCK_RAIL_MINTER_KEY?.trim() as Hex | undefined
  if (!key || !railBotConfigured()) throw new Error("MOCK_RAIL_MINTER_KEY isn't set (run scripts/deploy-mock-stablecoins.mjs)")
  return createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport: transport() })
}

const abi = artifact.abi

/** Mint local tokens to `to` (local currency arrived via a rail). Returns the tx hash once confirmed. */
export async function railMint(currency: LocalCurrency, to: Address, amountMinor: bigint, ref: string): Promise<Hex> {
  const token = MOCK_TOKENS[currency]
  const hash = await botWallet().writeContract({ address: token.address, abi, functionName: "mint", args: [to, amountMinor, ref] })
  const receipt = await publicClient().waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`mint reverted (${hash})`)
  return hash
}

/** Burn local tokens from `from` (local currency left via a rail payout). */
export async function railBurn(currency: LocalCurrency, from: Address, amountMinor: bigint, ref: string): Promise<Hex> {
  const token = MOCK_TOKENS[currency]
  const hash = await botWallet().writeContract({ address: token.address, abi, functionName: "burn", args: [from, amountMinor, ref] })
  const receipt = await publicClient().waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`burn reverted (${hash})`)
  return hash
}

/** Balances of every mock token at an address, as minor-unit strings (null if unreadable). */
export async function mockTokenBalances(address: string): Promise<Record<LocalCurrency, string | null>> {
  const out = {} as Record<LocalCurrency, string | null>
  await Promise.all(
    LOCAL_CURRENCIES.map(async (c) => {
      try {
        const bal = (await publicClient().readContract({
          address: MOCK_TOKENS[c].address,
          abi,
          functionName: "balanceOf",
          args: [address as Address],
        })) as bigint
        out[c] = bal.toString()
      } catch {
        out[c] = null
      }
    })
  )
  return out
}

export async function faceUsdcBalanceOf(address: Address): Promise<bigint> {
  if (!FACE_USDC) throw new Error("Face USDC isn't deployed (run scripts/deploy-mock-stablecoins.mjs)")
  return (await publicClient().readContract({
    address: FACE_USDC.address,
    abi,
    functionName: "balanceOf",
    args: [address],
  })) as bigint
}

export async function faceUsdcMint(to: Address, amountMinor: bigint, ref: string): Promise<Hex> {
  if (!FACE_USDC) throw new Error("Face USDC isn't deployed (run scripts/deploy-mock-stablecoins.mjs)")
  const hash = await botWallet().writeContract({
    address: FACE_USDC.address,
    abi,
    functionName: "mint",
    args: [to, amountMinor, ref],
  })
  const receipt = await publicClient().waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`fUSDC mint reverted (${hash})`)
  return hash
}

export async function faceUsdcBurn(from: Address, amountMinor: bigint, ref: string): Promise<Hex> {
  if (!FACE_USDC) throw new Error("Face USDC isn't deployed (run scripts/deploy-mock-stablecoins.mjs)")
  const hash = await botWallet().writeContract({
    address: FACE_USDC.address,
    abi,
    functionName: "burn",
    args: [from, amountMinor, ref],
  })
  const receipt = await publicClient().waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`fUSDC burn reverted (${hash})`)
  return hash
}
