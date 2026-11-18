// Sancus: deploy the mock local-currency stablecoins (mBRL, mIDR, mTHB) to Arc testnet.
//
//   node scripts/deploy-mock-stablecoins.mjs
//
// First run creates the rail-bot key (MOCK_RAIL_MINTER_KEY in .env.local) and prints its
// address. Fund that address with a little testnet USDC (Arc's gas token), run again, and
// it deploys whichever tokens aren't deployed yet. Addresses are saved to
// contracts/mock-stablecoin/deployments.json (safe to commit: public testnet addresses).

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, formatEther, http } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  testnet: true,
})

export const MOCK_TOKENS = [
  { currency: "BRL", name: "Sancus Mock Brazilian Real", symbol: "mBRL", decimals: 2, country: "BR", rail: "PIX" },
  { currency: "IDR", name: "Sancus Mock Indonesian Rupiah", symbol: "mIDR", decimals: 2, country: "ID", rail: "QRIS" },
  { currency: "THB", name: "Sancus Mock Thai Baht", symbol: "mTHB", decimals: 2, country: "TH", rail: "PROMPTPAY" },
]

const root = process.cwd()
const envPath = resolve(root, ".env.local")
const artifactPath = resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json")
const deploymentsPath = resolve(root, "contracts/mock-stablecoin/deployments.json")

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
let key = env.match(/^MOCK_RAIL_MINTER_KEY=(.*)$/m)?.[1]?.trim()
if (!key) {
  key = generatePrivateKey()
  env = `${env.trimEnd()}\n\n# Rail bot: mints/burns the mock local stablecoins on Arc testnet (testnet only)\nMOCK_RAIL_MINTER_KEY=${key}\n`
  writeFileSync(envPath, env)
  console.log("Created the rail-bot key and saved it to .env.local")
}
const account = privateKeyToAccount(key)
const rpc = env.match(/^ARC_TESTNET_RPC_KEY=(.+)$/m)?.[1]?.trim()
const transport = http(rpc ? `https://rpc.testnet.arc.network/${rpc}` : "https://rpc.testnet.arc.network")
const publicClient = createPublicClient({ chain: arcTestnet, transport })
const wallet = createWalletClient({ account, chain: arcTestnet, transport })

const gas = await publicClient.getBalance({ address: account.address })
console.log(`Rail bot ${account.address} · gas balance ${formatEther(gas)} USDC`)
if (gas === 0n) {
  console.log("Fund this address with ~1 testnet USDC (faucet.circle.com → Arc Testnet), then run again.")
  process.exit(2)
}

const { abi, bytecode } = JSON.parse(readFileSync(artifactPath, "utf8"))
const deployments = existsSync(deploymentsPath)
  ? JSON.parse(readFileSync(deploymentsPath, "utf8"))
  : { chainId: arcTestnet.id, network: "arc-testnet", minter: account.address, tokens: {} }

for (const t of MOCK_TOKENS) {
  const existing = deployments.tokens[t.currency]
  if (existing?.address) {
    const code = await publicClient.getCode({ address: existing.address })
    if (code && code !== "0x") {
      console.log(`${t.symbol} already deployed at ${existing.address}`)
      continue
    }
  }
  console.log(`Deploying ${t.symbol}…`)
  const hash = await wallet.deployContract({ abi, bytecode, args: [t.name, t.symbol, t.decimals] })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`${t.symbol} deploy failed (${hash})`)
  deployments.tokens[t.currency] = {
    ...t,
    address: receipt.contractAddress,
    deployTx: hash,
    explorer: `https://explorer.testnet.arc.io/address/${receipt.contractAddress}`,
  }
  deployments.minter = account.address
  writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n")
  console.log(`✅ ${t.symbol} at ${receipt.contractAddress}`)
}
console.log(`Saved ${deploymentsPath}`)
