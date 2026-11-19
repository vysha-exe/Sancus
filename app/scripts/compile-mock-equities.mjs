import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve } from "node:path"

const require = createRequire(import.meta.url)
const solc = require("solc")
const root = resolve(process.cwd(), "contracts/mock-equities")
const source = readFileSync(resolve(root, "MockEquityBroker.sol"), "utf8")
const input = { language: "Solidity", sources: { "MockEquityBroker.sol": { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } }
const out = JSON.parse(solc.compile(JSON.stringify(input)))
for (const issue of out.errors ?? []) console.error(issue.formattedMessage || issue.message)
if ((out.errors ?? []).some((issue) => issue.severity === "error")) process.exit(1)
mkdirSync(root, { recursive: true })
for (const name of ["MockEquityToken", "MockEquityBroker"]) {
  const built = out.contracts["MockEquityBroker.sol"][name]
  writeFileSync(resolve(root, `${name}.json`), JSON.stringify({ contractName: name, abi: built.abi, bytecode: `0x${built.evm.bytecode.object}` }, null, 2) + "\n")
}
console.log("Compiled mock equity token and broker")
