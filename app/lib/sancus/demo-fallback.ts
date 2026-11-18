import { createHash } from "node:crypto"

export function demoFallbacksEnabled() {
  return process.env.SANCUS_DEMO_FALLBACKS?.trim().toLowerCase() === "true"
}

export function useDemoFallback(requiredEnv: string) {
  return demoFallbacksEnabled() || !process.env[requiredEnv]?.trim()
}

export function stableDemoToken(value: string, length = 16) {
  return createHash("sha256").update(value).digest("hex").slice(0, length).toUpperCase()
}
