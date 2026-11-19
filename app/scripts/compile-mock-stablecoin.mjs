// Compile SancusMockStablecoin.sol → SancusMockStablecoin.json (abi + bytecode).
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

const require = createRequire(import.meta.url)
const solc = require("solc")

const root = resolve(process.cwd(), "contracts/mock-stablecoin")
const source = readFileSync(resolve(root, "SancusMockStablecoin.sol"), "utf8")
const input = {
  language: "Solidity",
  sources: { "SancusMockStablecoin.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
if (out.errors?.length) {
  for (const e of out.errors) console.error(e.formattedMessage || e.message)
  if (out.errors.some((e) => e.severity === "error")) process.exit(1)
}
const art = out.contracts["SancusMockStablecoin.sol"].SancusMockStablecoin
const bytecode = art.evm.bytecode.object.startsWith("0x") ? art.evm.bytecode.object : `0x${art.evm.bytecode.object}`
const json = {
  contractName: "SancusMockStablecoin",
  compiler: "solc 0.8.26 (optimizer on)",
  abi: art.abi,
  bytecode,
}
writeFileSync(resolve(root, "SancusMockStablecoin.json"), JSON.stringify(json, null, 2) + "\n")
console.log(`Wrote ${resolve(root, "SancusMockStablecoin.json")} · bytecode ${bytecode.length} chars`)
