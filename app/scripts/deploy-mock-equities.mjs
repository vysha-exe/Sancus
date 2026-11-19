import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const root = process.cwd()
const env = readFileSync(resolve(root, ".env"), "utf8")
const key = env.match(/^MOCK_RAIL_MINTER_KEY=(.*)$/m)?.[1]?.trim()
if (!key) throw new Error("MOCK_RAIL_MINTER_KEY is required")
const rpcKey = env.match(/^ARC_TESTNET_RPC_KEY=(.*)$/m)?.[1]?.trim()
const chain = defineChain({ id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [rpcKey ? `https://rpc.testnet.arc.network/${rpcKey}` : "https://rpc.testnet.arc.network"] } }, testnet: true })
const transport = http(chain.rpcUrls.default.http[0])
const account = privateKeyToAccount(key)
const pub = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
const dir = resolve(root, "contracts/mock-equities")
const token = JSON.parse(readFileSync(resolve(dir, "MockEquityToken.json"), "utf8"))
const brokerArtifact = JSON.parse(readFileSync(resolve(dir, "MockEquityBroker.json"), "utf8"))
const fUsdc = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/deployments.json"), "utf8")).faceUsdc.address
const outPath = resolve(dir, "deployments.json")
const saved = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {}

async function deploy(abi, bytecode, args) {
  const hash = await wallet.deployContract({ abi, bytecode, args })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`)
  return { address: receipt.contractAddress, deployTx: hash }
}

saved.nvda ??= await deploy(token.abi, token.bytecode, ["Sancus NVIDIA", "NVDA"])
saved.googl ??= await deploy(token.abi, token.bytecode, ["Sancus Alphabet", "GOOGL"])
saved.broker ??= await deploy(brokerArtifact.abi, brokerArtifact.bytecode, [fUsdc])
for (const asset of [saved.nvda.address, saved.googl.address]) {
  const setHash = await wallet.writeContract({ address: asset, abi: token.abi, functionName: "setBroker", args: [saved.broker.address] })
  await pub.waitForTransactionReceipt({ hash: setHash })
}
for (const [asset, price] of [[saved.nvda.address, parseUnits("180", 6)], [saved.googl.address, parseUnits("320", 6)]]) {
  const hash = await wallet.writeContract({ address: saved.broker.address, abi: brokerArtifact.abi, functionName: "setAsset", args: [asset, price] })
  await pub.waitForTransactionReceipt({ hash })
}
const stable = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json"), "utf8"))
const seed = await wallet.writeContract({ address: fUsdc, abi: stable.abi, functionName: "mint", args: [saved.broker.address, parseUnits("1000000", 6), "equity-broker-liquidity"] })
await pub.waitForTransactionReceipt({ hash: seed })
saved.chainId = 5042002
saved.fUsdc = fUsdc
writeFileSync(outPath, JSON.stringify(saved, null, 2) + "\n")
console.log(`Saved ${outPath}`)
