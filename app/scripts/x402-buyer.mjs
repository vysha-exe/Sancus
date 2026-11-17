// Sancus demo: an outside AI agent that pays Sancus per call over x402.
//
//   node scripts/x402-buyer.mjs --generate          # create a buyer wallet (prints the address to fund)
//   node scripts/x402-buyer.mjs                      # pay 3 times for route quotes
//   node scripts/x402-buyer.mjs --calls 10 --url http://localhost:3010
//
// The buyer wallet needs testnet USDC on Arc (faucet.circle.com → Arc Testnet).
// On first run it deposits into Circle Gateway, then every call is a gasless
// nanopayment that lands in the Sancus treasury's Gateway balance.

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { GatewayClient } from "@circle-fin/x402-batching/client"

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback
}

const envPath = resolve(process.cwd(), ".env.local")
let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
const read = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim()

if (args.includes("--generate")) {
  if (read("BUYER_PRIVATE_KEY")) {
    console.log("BUYER_PRIVATE_KEY already set. Address:", privateKeyToAccount(read("BUYER_PRIVATE_KEY")).address)
    process.exit(0)
  }
  const key = generatePrivateKey()
  env = `${env.trimEnd()}\n\n# Demo x402 buyer agent (testnet only)\nBUYER_PRIVATE_KEY=${key}\n`
  writeFileSync(envPath, env)
  console.log("✅ Buyer wallet created and saved to .env.local")
  console.log("   Address:", privateKeyToAccount(key).address)
  console.log("   Fund it: https://faucet.circle.com → Arc Testnet → USDC → paste the address above")
  process.exit(0)
}

const key = read("BUYER_PRIVATE_KEY") || process.env.BUYER_PRIVATE_KEY
if (!key) {
  console.error("No BUYER_PRIVATE_KEY. Run: node scripts/x402-buyer.mjs --generate")
  process.exit(1)
}

const base = flag("url", process.env.SANCUS_URL || "http://localhost:3000").replace(/\/$/, "")
const calls = Number(flag("calls", "3"))
const depositAmount = flag("deposit", "1")
const country = flag("country", "SG")
const amount = flag("amount", "2000")

// Show the price the endpoint is asking for (free discovery call).
const discovery = await fetch(`${base}/api/x402`).then((r) => r.json()).catch(() => null)
if (!discovery?.configured) {
  console.error(`❌ ${base}/api/x402 says payments aren't configured (no payTo address).`)
  console.error("   Set SANCUS_X402_PAY_TO or create an Arc wallet for the Sancus account, then restart the app.")
  process.exit(1)
}
const ep = discovery.endpoints[0]
console.log(`Sancus sells ${ep.path} for ${ep.price} → paid to ${discovery.payTo} on ${discovery.network}`)

const gateway = new GatewayClient({ chain: "arcTestnet", privateKey: key })
console.log("Buyer agent:", gateway.account.address)

const balances = await gateway.getBalances()
console.log(`Wallet ${balances.wallet.formatted} USDC · Gateway ${balances.gateway.formattedAvailable} USDC`)

const priceMinor = BigInt(Math.round(Number(ep.price.split(" ")[0]) * 1_000_000))
if (balances.gateway.available < priceMinor * BigInt(calls)) {
  const needed = BigInt(Math.round(Number(depositAmount) * 1_000_000))
  if (balances.wallet.balance < needed) {
    console.error(`❌ Not enough USDC. Fund ${gateway.account.address} at https://faucet.circle.com (Arc Testnet).`)
    process.exit(1)
  }
  console.log(`Depositing ${depositAmount} USDC into Circle Gateway…`)
  const dep = await gateway.deposit(depositAmount)
  console.log(`Deposited (tx ${dep.depositTxHash})`)
}

const url = `${base}${ep.path}?country=${country}&amount=${amount}&recipientType=UEN`
let spent = 0
for (let i = 1; i <= calls; i++) {
  const started = Date.now()
  try {
    const { data, formattedAmount, transaction } = await gateway.pay(url)
    spent += Number(formattedAmount)
    console.log(
      `#${i} paid ${formattedAmount} USDC (${Date.now() - started} ms) → best: ${data.best.rail}, ${data.best.usdcCost} USDC for ${data.amount}, ${data.best.rate}` +
        (transaction ? ` · settlement ${String(transaction).slice(0, 12)}…` : "")
    )
  } catch (err) {
    console.error(`#${i} failed:`, err?.message ?? err)
  }
}
console.log(`Done. Spent ${spent.toFixed(6)} USDC. Check Sancus → Agents for the earnings.`)
