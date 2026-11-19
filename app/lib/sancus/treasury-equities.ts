import { createPublicClient, defineChain, formatUnits, http, parseUnits, type Address } from "viem"
import tokenArtifact from "@/contracts/mock-equities/MockEquityToken.json"
import brokerArtifact from "@/contracts/mock-equities/MockEquityBroker.json"
import deployments from "@/contracts/mock-equities/deployments.json"

const chain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_TESTNET_RPC_KEY ? `https://rpc.testnet.arc.network/${process.env.ARC_TESTNET_RPC_KEY}` : "https://rpc.testnet.arc.network"] } },
  testnet: true,
})
const client = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) })

export const EQUITY_BROKER = deployments.broker.address as Address
export const EQUITIES = {
  NVDA: { symbol: "NVDA", name: "NVIDIA", address: deployments.nvda.address as Address },
  GOOGL: { symbol: "GOOGL", name: "Alphabet", address: deployments.googl.address as Address },
} as const
export type EquitySymbol = keyof typeof EQUITIES

export async function treasuryEquityPortfolio(owner: Address) {
  return Promise.all(Object.values(EQUITIES).map(async (asset) => {
    const [balance, price] = await Promise.all([
      client.readContract({ address: asset.address, abi: tokenArtifact.abi, functionName: "balanceOf", args: [owner] }) as Promise<bigint>,
      client.readContract({ address: EQUITY_BROKER, abi: brokerArtifact.abi, functionName: "priceMicroUsdc", args: [asset.address] }) as Promise<bigint>,
    ])
    const valueMinor = balance * price / 10n ** 18n
    return {
      ...asset,
      balanceAtomic: balance.toString(),
      shares: formatUnits(balance, 18),
      priceMinor: price.toString(),
      valueMinor: valueMinor.toString(),
    }
  }))
}

export function equityBuyQuote(symbol: EquitySymbol, usdc: string, priceMinor: bigint) {
  const usdcMinor = parseUnits(usdc, 6)
  const shares = usdcMinor * 10n ** 18n / priceMinor
  if (usdcMinor <= 0n || shares <= 0n) throw new Error("Trade amount is too small")
  return { asset: EQUITIES[symbol], usdcMinor, shares }
}

export function equitySellQuote(symbol: EquitySymbol, sharesInput: string, priceMinor: bigint) {
  const shares = parseUnits(sharesInput, 18)
  const usdcMinor = shares * priceMinor / 10n ** 18n
  if (shares <= 0n || usdcMinor <= 0n) throw new Error("Trade amount is too small")
  return { asset: EQUITIES[symbol], usdcMinor, shares }
}

export { tokenArtifact, brokerArtifact }
