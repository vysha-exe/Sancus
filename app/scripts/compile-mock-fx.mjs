import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

const require = createRequire(import.meta.url)
const solc = require("solc")
const dir = resolve(process.cwd(), "contracts/mock-fx")
const source = readFileSync(resolve(dir, "SancusFixedFx.sol"), "utf8")
const input = {
  language: "Solidity",
  sources: { "SancusFixedFx.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
}
const out = JSON.parse(solc.compile(JSON.stringify(input)))
for (const issue of out.errors ?? []) console.error(issue.formattedMessage || issue.message)
if ((out.errors ?? []).some((issue) => issue.severity === "error")) process.exit(1)
const built = out.contracts["SancusFixedFx.sol"].SancusFixedFx
writeFileSync(
  resolve(dir, "SancusFixedFx.json"),
  JSON.stringify({ contractName: "SancusFixedFx", compiler: solc.version(), abi: built.abi, bytecode: `0x${built.evm.bytecode.object}` }, null, 2) + "\n"
)
console.log("Compiled SancusFixedFx")
