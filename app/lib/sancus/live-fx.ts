// Sancus: live FX reference rates (USD base; USDC is treated as 1 USD). Server only.
//   1. Frankfurter (European Central Bank reference rates, updated each business day)
//   2. open.er-api.com (fallback)
//   3. the configured rates, if both are unreachable
// Cached for 10 minutes. Only currency codes are sent; no account data leaves the server.

import { fxConfigFromEnv, type FxConfig } from "./fx"

export type FxSource ="ecb" | "open-er-api" | "configured"
export type LiveRates = { rates: Record<string, number>; source: FxSource; asOf: string }

const WANTED = ["SGD", "BRL", "EUR", "MXN", "THB", "IDR"] as const
const FALLBACK: Record<string, number> = { SGD: 1.34, BRL: 5.4123, EUR: 0.921, MXN: 17.05, THB: 35, IDR: 16000 }
const TTL_MS = 10 * 60 * 1000

let cache: { at: number; value: LiveRates } | null = null

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

function complete(rates: Record<string, unknown>): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const c of WANTED) {
    const v = Number(rates[c])
    if (!Number.isFinite(v) || v <= 0) return null
    out[c] = v
  }
  return out
}

export async function getLiveRates(): Promise<LiveRates> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  let value: LiveRates | null = null
  try {
    const body = (await fetchJson(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${WANTED.join(",")}`)) as {
      date?: string
      rates?: Record<string, unknown>
    }
    const rates = body.rates ? complete(body.rates) : null
    if (rates) value = { rates, source: "ecb", asOf: body.date ?? new Date().toISOString().slice(0, 10) }
  } catch {
    /* try the next source */
  }
  if (!value) {
    try {
      const body = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as { rates?: Record<string, unknown>; time_last_update_utc?: string }
      const rates = body.rates ? complete(body.rates) : null
      if (rates) value = { rates, source: "open-er-api", asOf: body.time_last_update_utc ?? new Date().toISOString() }
    } catch {
      /* fall back below */
    }
  }
  value ??= { rates: { ...FALLBACK }, source: "configured", asOf: new Date().toISOString() }
  cache = { at: Date.now(), value }
  return value
}

/** A rate as local-per-USD × 1e6 (the integer form the quote math uses). */
export function toRateMicro(rate: number): bigint {
  return BigInt(Math.round(rate * 1_000_000))
}

/** Singapore payout FX config with the live SGD mid rate (spread and fees stay as configured). */
export async function liveSgdFxConfig(): Promise<FxConfig> {
  const base = fxConfigFromEnv()
  const { rates, source } = await getLiveRates()
  return source === "configured" ? base : { ...base, midRateMicro: toRateMicro(rates.SGD!) }
}

export const FX_SOURCE_LABEL: Record<FxSource, string> = {
  ecb: "ECB reference rate",
  "open-er-api": "market reference rate",
  configured: "indicative rate (live rates unavailable)",
}
