// Fixed-rate mint/burn FX on Arc testnet. This is a transport layer only:
// branch operating balances remain in bank accounts and local test tokens exist only in-flight.

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import artifact from "@/contracts/mock-fx/SancusFixedFx.json"
import deployment from "@/contracts/mock-fx/deployments.json"
import { FACE_USDC, MOCK_TOKENS, faceUsdcBurn, faceUsdcMint, railBurn, railMint, type LocalCurrency } from "./mock-tokens"

export type FxCurrency = LocalCurrency | "USD" | "USDC"

type FxDeployment = {
  address?: string | null
  assets?: Record<string, { address: string; decimals: number; unitsPerUsdMicro: number }>
}

const configured = deployment as FxDeployment
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

function railBot() {
  const key = process.env.MOCK_RAIL_MINTER_KEY?.trim() as Hex | undefined
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("MOCK_RAIL_MINTER_KEY is not configured")
  return createWalletClient({ account: privateKeyToAccount(key), chain: arcTestnet, transport: transport() })
}

let pub: ReturnType<typeof createPublicClient> | null = null
const publicClient = () => (pub ??= createPublicClient({ chain: arcTestnet, transport: transport() }))

export function fixedFxAddress(): Address | null {
  return /^0x[0-9a-fA-F]{40}$/.test(configured.address ?? "") ? (configured.address as Address) : null
}

export function fixedFxEnabled(): boolean {
  return Boolean(fixedFxAddress()) && /^0x[0-9a-fA-F]{64}$/.test(process.env.MOCK_RAIL_MINTER_KEY?.trim() ?? "")
}

export function fxAsset(currency: string): { address: Address; decimals: number; unitsPerUsdMicro: bigint } {
  const normalized = currency === "USD" ? "USDC" : currency
  const saved = configured.assets?.[normalized]
  if (saved?.address) {
    return { address: saved.address as Address, decimals: saved.decimals, unitsPerUsdMicro: BigInt(saved.unitsPerUsdMicro) }
  }
  if (normalized === "USDC" && FACE_USDC) {
    return { address: FACE_USDC.address, decimals: FACE_USDC.decimals, unitsPerUsdMicro: 1_000_000n }
  }
  if (normalized === "BRL" || normalized === "IDR" || normalized === "THB") {
    const token = MOCK_TOKENS[normalized]
    const rates = { BRL: 5_412_300n, IDR: 16_000_000_000n, THB: 35_000_000n }
    return { address: token.address, decimals: token.decimals, unitsPerUsdMicro: rates[normalized] }
  }
  throw new Error(`Fixed FX does not support ${currency}`)
}

const unit = (decimals: number) => 10n ** BigInt(decimals)

/** Mirror the contract quote exactly so the database and minAmountOut use the same rounding. */
export function quoteFixedFx(sourceCurrency: string, destinationCurrency: string, sourceTokenMinor: bigint): bigint {
  if (sourceCurrency === destinationCurrency) return sourceTokenMinor
  const source = fxAsset(sourceCurrency)
  const destination = fxAsset(destinationCurrency)
  return (sourceTokenMinor * destination.unitsPerUsdMicro * unit(destination.decimals)) /
    (source.unitsPerUsdMicro * unit(source.decimals))
}

/** Bank ledgers use cents; fUSDC uses six decimals. Local mock currencies use two decimals. */
export function transportMinorFromBankMinor(currency: string, bankMinor: bigint): bigint {
  return currency === "USD" ? bankMinor * 10_000n : bankMinor
}

export function bankMinorFromTransportMinor(currency: string, tokenMinor: bigint): bigint {
  return currency === "USD" ? (tokenMinor + 5_000n) / 10_000n : tokenMinor
}

export async function mintTransportFromBank(currency: string, to: Address, bankMinor: bigint, ref: string): Promise<Hex> {
  const tokenMinor = transportMinorFromBankMinor(currency, bankMinor)
  if (currency === "USD" || currency === "USDC") return faceUsdcMint(to, tokenMinor, ref)
  return railMint(currency as LocalCurrency, to, tokenMinor, ref)
}

export async function burnTransportToBank(currency: string, from: Address, tokenMinor: bigint, ref: string): Promise<Hex> {
  if (currency === "USD" || currency === "USDC") return faceUsdcBurn(from, tokenMinor, ref)
  return railBurn(currency as LocalCurrency, from, tokenMinor, ref)
}

export async function executeFixedFx(input: {
  sourceCurrency: string
  destinationCurrency: string
  sourceHolder: Address
  recipient: Address
  sourceTokenMinor: bigint
  minDestinationTokenMinor: bigint
  ref: string
}): Promise<{ txHash: Hex; destinationTokenMinor: bigint; rateVersion: bigint }> {
  const address = fixedFxAddress()
  if (!address) throw new Error("SancusFixedFx is not deployed")
  const source = fxAsset(input.sourceCurrency)
  const destination = fxAsset(input.destinationCurrency)
  const destinationTokenMinor = quoteFixedFx(input.sourceCurrency, input.destinationCurrency, input.sourceTokenMinor)
  const ref = keccak256(toHex(input.ref))
  const wallet = railBot()
  const txHash = await wallet.writeContract({
    address,
    abi: artifact.abi,
    functionName: "operatorSwapFromTo",
    args: [
      source.address,
      destination.address,
      input.sourceHolder,
      input.recipient,
      input.sourceTokenMinor,
      input.minDestinationTokenMinor,
      ref,
    ],
  })
  const receipt = await publicClient().waitForTransactionReceipt({ hash: txHash })
  if (receipt.status !== "success") throw new Error(`Fixed FX conversion reverted (${txHash})`)
  const rateVersion = (await publicClient().readContract({
    address,
    abi: artifact.abi,
    functionName: "rateVersion",
  })) as bigint
  return { txHash, destinationTokenMinor, rateVersion }
}
