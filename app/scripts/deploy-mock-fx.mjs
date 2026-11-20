import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const root = process.cwd()
const readEnv = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "")
const env = `${readEnv(resolve(root, ".env"))}\n${readEnv(resolve(root, ".env.local"))}`
const value = (name) => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim()
const key = value("MOCK_RAIL_MINTER_KEY")
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) throw new Error("MOCK_RAIL_MINTER_KEY is required")

const rpcKey = value("ARC_TESTNET_RPC_KEY")
const rpcUrl = rpcKey ? `https://rpc.testnet.arc.network/${rpcKey}` : "https://rpc.testnet.arc.network"
const chain = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
})
const transport = http(rpcUrl)
const account = privateKeyToAccount(key)
const pub = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })
const fxDir = resolve(root, "contracts/mock-fx")
const fxArtifact = JSON.parse(readFileSync(resolve(fxDir, "SancusFixedFx.json"), "utf8"))
const stableDir = resolve(root, "contracts/mock-stablecoin")
const stableArtifact = JSON.parse(readFileSync(resolve(stableDir, "SancusMockStablecoin.json"), "utf8"))
const stableDeployments = JSON.parse(readFileSync(resolve(stableDir, "deployments.json"), "utf8"))
const outputPath = resolve(fxDir, "deployments.json")
const saved = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : {}

async function confirmed(hash) {
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`)
  return receipt
}

let address = saved.address
if (address) {
  const code = await pub.getCode({ address })
  if (!code || code === "0x") address = null
}
if (!address) {
  console.log("Deploying SancusFixedFx…")
  const hash = await wallet.deployContract({ abi: fxArtifact.abi, bytecode: fxArtifact.bytecode })
  const receipt = await confirmed(hash)
  if (!receipt.contractAddress) throw new Error(`Deployment returned no address: ${hash}`)
  address = receipt.contractAddress
  saved.address = address
  saved.deployTx = hash
}

const assets = [
  { currency: "USDC", ...stableDeployments.faceUsdc, rateMicro: 1_000_000 },
  ...Object.values(stableDeployments.tokens).map((token) => ({
    ...token,
    rateMicro: { BRL: 5_412_300, IDR: 16_000_000_000, THB: 35_000_000 }[token.currency],
  })),
]

for (const asset of assets) {
  if (!asset.address || !asset.rateMicro) throw new Error(`Missing deployment/rate for ${asset.currency}`)
  const current = await pub.readContract({ address, abi: fxArtifact.abi, functionName: "assets", args: [asset.address] })
  if (Number(current[0]) !== asset.rateMicro || Number(current[1]) !== asset.decimals || current[2] !== true) {
    console.log(`Setting ${asset.currency} fixed rate…`)
    await confirmed(await wallet.writeContract({
      address,
      abi: fxArtifact.abi,
      functionName: "setAsset",
      args: [asset.address, BigInt(asset.rateMicro), asset.decimals, true],
    }))
  }
  const isMinter = await pub.readContract({ address: asset.address, abi: stableArtifact.abi, functionName: "minters", args: [address] })
  if (!isMinter) {
    console.log(`Authorizing FX contract on ${asset.symbol}…`)
    await confirmed(await wallet.writeContract({
      address: asset.address,
      abi: stableArtifact.abi,
      functionName: "setMinter",
      args: [address, true],
    }))
  }
}

saved.chainId = chain.id
saved.network = "arc-testnet"
saved.owner = account.address
saved.explorer = `https://explorer.testnet.arc.io/address/${address}`
saved.assets = Object.fromEntries(assets.map((asset) => [asset.currency, {
  address: asset.address,
  symbol: asset.symbol,
  decimals: asset.decimals,
  unitsPerUsdMicro: asset.rateMicro,
}]))
writeFileSync(outputPath, JSON.stringify(saved, null, 2) + "\n")
console.log(`SancusFixedFx ready at ${address}`)
