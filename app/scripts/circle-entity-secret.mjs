// Sancus: one-time Circle entity secret setup.
//
// Usage (from app/):  node scripts/circle-entity-secret.mjs
//
// 1. Reads CIRCLE_API_KEY from .env.local.
// 2. Generates a new 32-byte entity secret (unless CIRCLE_ENTITY_SECRET is already set).
// 3. Registers it with Circle and saves the recovery file to circle-recovery/ (git-ignored).
// 4. Writes CIRCLE_ENTITY_SECRET into .env.local.
//
// Keep the recovery file somewhere safe (password manager). Circle never stores
// your entity secret; without it or the recovery file you lose control of the wallets.

import { randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets"

const envPath = resolve(process.cwd(), ".env.local")
if (!existsSync(envPath)) {
  console.error("No .env.local found. Run this from app/ after `cp .env.example .env.local`.")
  process.exit(1)
}

let env = readFileSync(envPath, "utf8")
const read = (key) => env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim()

const apiKey = read("CIRCLE_API_KEY")
if (!apiKey) {
  console.error("Set CIRCLE_API_KEY in .env.local first (Circle Console → Testnet → API Keys).")
  process.exit(1)
}
if (read("CIRCLE_ENTITY_SECRET")) {
  console.error("CIRCLE_ENTITY_SECRET is already set in .env.local. Nothing to do.")
  process.exit(0)
}

const entitySecret = randomBytes(32).toString("hex")

try {
  const res = await registerEntitySecretCiphertext({ apiKey, entitySecret })
  const recovery = res.data?.recoveryFile ?? ""
  const dir = resolve(process.cwd(), "circle-recovery")
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `recovery_file_${new Date().toISOString().slice(0, 10)}.dat`)
  writeFileSync(file, recovery)

  env = /^CIRCLE_ENTITY_SECRET=.*$/m.test(env)
    ? env.replace(/^CIRCLE_ENTITY_SECRET=.*$/m, `CIRCLE_ENTITY_SECRET=${entitySecret}`)
    : `${env.trimEnd()}\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`
  writeFileSync(envPath, env)

  console.log("✅ Entity secret registered with Circle and saved to .env.local")
  console.log(`✅ Recovery file saved to ${file}`)
  console.log("   Move it to a password manager. It is git-ignored, but don't lose it.")
} catch (err) {
  const msg = err?.response?.data?.message ?? err?.message ?? String(err)
  console.error("❌ Registration failed:", msg)
  console.error("   If an entity secret is already registered for this API key, reuse that secret,")
  console.error("   or reset it in the Circle Console (Wallets → Developer Controlled → Configurator).")
  process.exit(1)
}
