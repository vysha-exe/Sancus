import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const root = process.cwd()
const env = [".env.local", ".env"].map((name) => {
  try { return readFileSync(resolve(root, name), "utf8") } catch { return "" }
}).join("\n")
const key = env.match(/^MOCK_RAIL_MINTER_KEY=(.*)$/m)?.[1]?.trim()
if (!key) throw new Error("MOCK_RAIL_MINTER_KEY is required")
const rpcKey = env.match(/^ARC_TESTNET_RPC_KEY=(.*)$/m)?.[1]?.trim()
const rpc = rpcKey ? `https://rpc.testnet.arc.network/${rpcKey}` : "https://rpc.testnet.arc.network"
const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [rpc] } }, testnet: true })
const transport = http(rpc)
const account = privateKeyToAccount(key)
const publicClient = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
const deployments = JSON.parse(readFileSync(resolve(root, "contracts/mock-equities/deployments.json"), "utf8"))
const token = JSON.parse(readFileSync(resolve(root, "contracts/mock-equities/MockEquityToken.json"), "utf8"))
const broker = JSON.parse(readFileSync(resolve(root, "contracts/mock-equities/MockEquityBroker.json"), "utf8"))
const stable = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json"), "utf8"))

async function confirm(hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`Transaction failed: ${hash}`)
  return hash
}

const spend = parseUnits("1", 6)
const ref = `equity-verification:${Date.now()}`
const fUsdcBefore = await publicClient.readContract({ address: deployments.fUsdc, abi: stable.abi, functionName: "balanceOf", args: [account.address] })
const sharesBefore = await publicClient.readContract({ address: deployments.nvda.address, abi: token.abi, functionName: "balanceOf", args: [account.address] })
if (fUsdcBefore < spend) {
  await confirm(await wallet.writeContract({ address: deployments.fUsdc, abi: stable.abi, functionName: "mint", args: [account.address, parseUnits("10", 6), ref] }))
}
const sharesOut = await publicClient.readContract({ address: deployments.broker.address, abi: broker.abi, functionName: "quoteBuy", args: [deployments.nvda.address, spend] })
await confirm(await wallet.writeContract({ address: deployments.fUsdc, abi: stable.abi, functionName: "approve", args: [deployments.broker.address, spend] }))
const buyTx = await confirm(await wallet.writeContract({ address: deployments.broker.address, abi: broker.abi, functionName: "buy", args: [deployments.nvda.address, spend, sharesOut] }))
const purchased = await publicClient.readContract({ address: deployments.nvda.address, abi: token.abi, functionName: "balanceOf", args: [account.address] })
if (purchased !== sharesBefore + sharesOut) throw new Error("NVDA purchase balance did not match the broker quote")
const sellQuote = await publicClient.readContract({ address: deployments.broker.address, abi: broker.abi, functionName: "quoteSell", args: [deployments.nvda.address, sharesOut] })
const sellTx = await confirm(await wallet.writeContract({ address: deployments.broker.address, abi: broker.abi, functionName: "sell", args: [deployments.nvda.address, sharesOut, sellQuote] }))
const sharesAfter = await publicClient.readContract({ address: deployments.nvda.address, abi: token.abi, functionName: "balanceOf", args: [account.address] })
if (sharesAfter !== sharesBefore) throw new Error("NVDA sell did not restore the starting share balance")

console.log(JSON.stringify({
  chainId: await publicClient.getChainId(),
  account: account.address,
  roundTripFusdcMinor: spend.toString(),
  returnedFusdcMinor: sellQuote.toString(),
  sharesAtomic: sharesOut.toString(),
  buyTx,
  sellTx,
  verified: true,
}, null, 2))
