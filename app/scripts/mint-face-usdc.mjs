// Mint lots of Face USDC (fUSDC) to one or more Arc addresses using the rail bot.
//
//   node scripts/mint-face-usdc.mjs 0xWallet1 0xWallet2
//   node scripts/mint-face-usdc.mjs --amount 5000000 0xWallet
//
// Amount is human USDC (default 1_000_000). Requires MOCK_RAIL_MINTER_KEY + deployed faceUsdc.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, http, parseUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const root = process.cwd()
const envPath = resolve(root, ".env.local")
const artifactPath = resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json")
const deploymentsPath = resolve(root, "contracts/mock-stablecoin/deployments.json")

const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
const key = env.match(/^MOCK_RAIL_MINTER_KEY=(.*)$/m)?.[1]?.trim()
if (!key) {
  console.error("MOCK_RAIL_MINTER_KEY missing — run scripts/deploy-mock-stablecoins.mjs first")
  process.exit(1)
}
const deployments = JSON.parse(readFileSync(deploymentsPath, "utf8"))
const face = deployments.faceUsdc
if (!face?.address) {
  console.error("faceUsdc not in deployments.json — run scripts/deploy-mock-stablecoins.mjs")
  process.exit(1)
}

const args = process.argv.slice(2)
let amountHuman = "1000000"
const wallets = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--amount") {
    amountHuman = args[++i]
    continue
  }
  if (/^0x[a-fA-F0-9]{40}$/.test(args[i])) wallets.push(args[i])
}
if (!wallets.length) {
  console.error("Usage: node scripts/mint-face-usdc.mjs [--amount 1000000] 0xWallet…")
  process.exit(1)
}

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
})
const rpc = env.match(/^ARC_TESTNET_RPC_KEY=(.+)$/m)?.[1]?.trim()
const transport = http(rpc ? `https://rpc.testnet.arc.network/${rpc}` : "https://rpc.testnet.arc.network")
const account = privateKeyToAccount(key)
const publicClient = createPublicClient({ chain: arcTestnet, transport })
const wallet = createWalletClient({ account, chain: arcTestnet, transport })
const { abi } = JSON.parse(readFileSync(artifactPath, "utf8"))
const amount = parseUnits(amountHuman, face.decimals)

console.log(`Minting ${amountHuman} ${face.symbol} from ${account.address}`)
console.log(`Token ${face.address}`)

for (const to of wallets) {
  const hash = await wallet.writeContract({
    address: face.address,
    abi,
    functionName: "mint",
    args: [to, amount, `sancus:face-usdc:bootstrap:${Date.now()}`],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") throw new Error(`mint failed ${hash}`)
  console.log(`✅ ${to} · ${hash}`)
  console.log(`   https://explorer.testnet.arc.io/tx/${hash}`)
}
