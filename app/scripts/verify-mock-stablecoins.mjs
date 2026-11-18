// Sancus: prove the mock local stablecoins (mBRL, mIDR, mTHB) really work on Arc testnet.
//
//   node scripts/verify-mock-stablecoins.mjs            # full check (spends a tiny bit of testnet gas)
//   node scripts/verify-mock-stablecoins.mjs --read     # read-only: no transactions
//
// For each token it checks, against the live chain:
//   1. contract is deployed and reports the right name / symbol / decimals
//   2. the rail bot is a minter, and a random address is NOT (mint reverts with NotMinter)
//   3. totalSupply == sum of all balances (rebuilt from every Transfer event since deploy)
//   4. live round trip: mint 1.00 → transfer 0.40 to a throwaway address → burn both back,
//      checking balances and supply after each step
// and prints every holder plus explorer links so you can see it yourself.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, http, parseAbiItem } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const READ_ONLY = process.argv.includes("--read")
const root = process.cwd()
const envText = existsSync(resolve(root, ".env.local")) ? readFileSync(resolve(root, ".env.local"), "utf8") : ""
const envVar = (k) => process.env[k]?.trim() || envText.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim() || ""

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
})
const rpcKey = envVar("ARC_TESTNET_RPC_KEY")
const transport = http(rpcKey ? `https://rpc.testnet.arc.network/${rpcKey}` : "https://rpc.testnet.arc.network")
const pub = createPublicClient({ chain: arcTestnet, transport })

const { abi } = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json"), "utf8"))
const deployments = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/deployments.json"), "utf8"))
const EXPLORER = "https://explorer.testnet.arc.io"
const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)")

let failures = 0
const ok = (cond, label, detail = "") => {
  console.log(`  ${cond ? "✅" : "❌"} ${label}${detail ? `  (${detail})` : ""}`)
  if (!cond) failures++
  return cond
}
const fmt = (v, d) => (Number(v) / 10 ** d).toLocaleString(undefined, { maximumFractionDigits: d })
const read = (address, functionName, args = []) => pub.readContract({ address, abi, functionName, args })

const botKey = envVar("MOCK_RAIL_MINTER_KEY")
const bot = /^0x[0-9a-fA-F]{64}$/.test(botKey) ? privateKeyToAccount(botKey) : null
const wallet = bot ? createWalletClient({ account: bot, chain: arcTestnet, transport }) : null

async function send(address, functionName, args) {
  const hash = await wallet.writeContract({ address, abi, functionName, args })
  const r = await pub.waitForTransactionReceipt({ hash })
  if (r.status !== "success") throw new Error(`${functionName} reverted: ${hash}`)
  return hash
}

/** All Transfer logs since deploy, chunked (public RPCs cap the block range). */
async function transferLogs(address, fromBlock) {
  const latest = await pub.getBlockNumber()
  const logs = []
  const step = 9_000n
  for (let start = fromBlock; start <= latest; start += step + 1n) {
    const end = start + step > latest ? latest : start + step
    logs.push(...(await pub.getLogs({ address, event: transferEvent, fromBlock: start, toBlock: end })))
  }
  return logs
}

console.log(`Arc testnet · rail bot ${deployments.minter}${READ_ONLY ? " · read-only" : ""}\n`)
if (!bot && !READ_ONLY) {
  console.log("MOCK_RAIL_MINTER_KEY not found in .env.local, so running read-only.\n")
}

for (const t of Object.values(deployments.tokens)) {
  console.log(`${t.symbol}  ${t.name}  (${t.rail}, ${t.country})`)
  console.log(`  ${EXPLORER}/token/${t.address}`)

  // 1. deployed + metadata
  const code = await pub.getCode({ address: t.address })
  if (!ok(Boolean(code && code !== "0x"), "contract deployed")) continue
  const [name, symbol, decimals, supply, owner] = await Promise.all(
    ["name", "symbol", "decimals", "totalSupply", "owner"].map((f) => read(t.address, f))
  )
  ok(name === t.name && symbol === t.symbol && Number(decimals) === t.decimals, "name / symbol / decimals", `${symbol}, ${decimals} dp`)

  // 2. permissions
  ok(await read(t.address, "minters", [deployments.minter]), "rail bot is a minter", `owner ${owner.slice(0, 10)}…`)
  const stranger = privateKeyToAccount(generatePrivateKey()).address
  try {
    await pub.simulateContract({ account: stranger, address: t.address, abi, functionName: "mint", args: [stranger, 100n, "x"] })
    ok(false, "random address can't mint")
  } catch (e) {
    ok(/NotMinter/.test(String(e?.shortMessage ?? e?.message ?? e) + JSON.stringify(e?.cause?.data ?? "")), "random address can't mint", "reverts with NotMinter")
  }

  // 3. supply == sum of balances, rebuilt from events
  const deployBlock = t.deployTx ? (await pub.getTransactionReceipt({ hash: t.deployTx })).blockNumber : 0n
  const logs = await transferLogs(t.address, deployBlock)
  const balances = new Map()
  let mints = 0, burns = 0
  for (const log of logs) {
    const { args } = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics })
    if (args.from === "0x0000000000000000000000000000000000000000") mints++
    else balances.set(args.from, (balances.get(args.from) ?? 0n) - args.value)
    if (args.to === "0x0000000000000000000000000000000000000000") burns++
    else balances.set(args.to, (balances.get(args.to) ?? 0n) + args.value)
  }
  const sum = [...balances.values()].reduce((a, b) => a + b, 0n)
  ok(sum === supply, "totalSupply matches every Transfer event", `${fmt(supply, t.decimals)} ${symbol} · ${mints} mints, ${burns} burns`)
  const holders = [...balances.entries()].filter(([, v]) => v > 0n)
  for (const [addr, v] of holders) {
    const onchain = await read(t.address, "balanceOf", [addr])
    ok(onchain === v, `holder ${addr.slice(0, 8)}…${addr.slice(-4)} holds ${fmt(onchain, t.decimals)} ${symbol}`, `${EXPLORER}/address/${addr}`)
  }

  // 4. live round trip
  if (!READ_ONLY && bot) {
    const one = 10n ** BigInt(t.decimals)
    const part = (one * 4n) / 10n
    const temp = privateKeyToAccount(generatePrivateKey()).address
    const before = await read(t.address, "totalSupply")
    const botBefore = await read(t.address, "balanceOf", [bot.address])
    try {
      const m = await send(t.address, "mint", [bot.address, one, "verify:mint"])
      ok((await read(t.address, "totalSupply")) === before + one, `mint ${fmt(one, t.decimals)} → supply up`, `${EXPLORER}/tx/${m}`)
      const x = await send(t.address, "transfer", [temp, part])
      const tempBal = await read(t.address, "balanceOf", [temp])
      ok(tempBal === part, `transfer ${fmt(part, t.decimals)} to a fresh address`, `${EXPLORER}/tx/${x}`)
      await send(t.address, "burn", [temp, part, "verify:burn"])
      const b = await send(t.address, "burn", [bot.address, one - part, "verify:burn"])
      const after = await read(t.address, "totalSupply")
      ok(after === before && (await read(t.address, "balanceOf", [bot.address])) === botBefore, "burn both back → supply restored", `${EXPLORER}/tx/${b}`)
    } catch (e) {
      ok(false, "live round trip", e?.shortMessage ?? String(e))
    }
  }
  console.log("")
}

if (bot) {
  const gas = await pub.getBalance({ address: bot.address })
  console.log(`Rail bot gas left: ${fmt(gas, 18)} USDC`)
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed")
process.exit(failures ? 1 : 0)
