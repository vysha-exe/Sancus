// Prove fUSDC.mint works from a non-minter EOA (needs a tiny bit of gas).
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createPublicClient, createWalletClient, defineChain, http, parseEther, parseUnits } from "viem"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const root = process.cwd()
const env = existsSync(resolve(root, ".env.local")) ? readFileSync(resolve(root, ".env.local"), "utf8") : ""
const botKey = env.match(/^MOCK_RAIL_MINTER_KEY=(.*)$/m)?.[1]?.trim()
const face = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/deployments.json"), "utf8")).faceUsdc
const { abi } = JSON.parse(readFileSync(resolve(root, "contracts/mock-stablecoin/SancusMockStablecoin.json"), "utf8"))
if (!botKey || !face?.address) throw new Error("missing bot key or faceUsdc")

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
})
const rpc = env.match(/^ARC_TESTNET_RPC_KEY=(.+)$/m)?.[1]?.trim()
const transport = http(rpc ? `https://rpc.testnet.arc.network/${rpc}` : "https://rpc.testnet.arc.network")
const publicClient = createPublicClient({ chain: arc, transport })
const bot = privateKeyToAccount(botKey)
const botWallet = createWalletClient({ account: bot, chain: arc, transport })
const strangerKey = generatePrivateKey()
const stranger = privateKeyToAccount(strangerKey)
const strangerWallet = createWalletClient({ account: stranger, chain: arc, transport })

console.log(`Funding stranger ${stranger.address} with gas…`)
const fund = await botWallet.sendTransaction({ to: stranger.address, value: parseEther("0.01") })
await publicClient.waitForTransactionReceipt({ hash: fund })

const amount = parseUnits("42", face.decimals)
console.log(`Stranger minting 42 fUSDC to self…`)
const hash = await strangerWallet.writeContract({
  address: face.address,
  abi,
  functionName: "mint",
  args: [stranger.address, amount, "verify:public-mint"],
})
const receipt = await publicClient.waitForTransactionReceipt({ hash })
if (receipt.status !== "success") throw new Error("mint failed")
console.log(`✅ Public mint ok · ${hash}`)
console.log(`   https://explorer.testnet.arc.io/tx/${hash}`)
