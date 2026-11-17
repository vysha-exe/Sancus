// Sancus: USDC -> SGD quotes for Singapore payouts.
//
// SIMULATED: the rate comes from configuration (SANCUS_USD_SGD_RATE), not a live
// market feed. In production this is replaced by the payout partner's quote
// (e.g. StraitsX), which locks the rate for a short window.

import { ceilDiv, SGD_DECIMALS, USDC_DECIMALS } from "./money"
import type { SgRail } from "./paynow"

export const RATE_SCALE = 1_000_000n // rates are stored as SGD per USD * 1e6
export const QUOTE_TTL_MS = 60_000

export type FxConfig = {
  /** Mid-market SGD per USD, scaled by 1e6 (1.34 => 1_340_000n). */
  midRateMicro: bigint
  /** Spread applied to the mid rate, in basis points. */
  spreadBps: bigint
  /** Flat partner fee per payout, in SGD cents. */
  feeSgdMinor: Record<SgRail, bigint>
}

export const DEFAULT_FX_CONFIG: FxConfig = {
  midRateMicro: 1_340_000n,
  spreadBps: 30n,
  feeSgdMinor: { PAYNOW: 50n, FAST: 50n },
}

/** Reads overrides from env; falls back to defaults on anything malformed. */
export function fxConfigFromEnv(env: Record<string, string | undefined> = process.env): FxConfig {
  const cfg = { ...DEFAULT_FX_CONFIG, feeSgdMinor: { ...DEFAULT_FX_CONFIG.feeSgdMinor } }
  const rate = env.SANCUS_USD_SGD_RATE
  if (rate && /^\d+(\.\d{1,6})?$/.test(rate)) {
    const [w, f = ""] = rate.split(".")
    cfg.midRateMicro = BigInt(w) * RATE_SCALE + BigInt((f + "000000").slice(0, 6))
  }
  const spread = env.SANCUS_FX_SPREAD_BPS
  if (spread && /^\d{1,4}$/.test(spread)) cfg.spreadBps = BigInt(spread)
  return cfg
}

export type PayoutQuote = {
  rail: SgRail
  /** What the recipient receives, SGD cents. */
  sgdAmountMinor: bigint
  feeSgdMinor: bigint
  /** USDC debited from the treasury, 6 decimals. */
  usdcAmountMinor: bigint
  midRateMicro: bigint
  /** Rate the customer actually gets after spread. */
  clientRateMicro: bigint
  spreadBps: bigint
  expiresAt: Date
  simulated: true
}

/**
 * Quote for a payout where the recipient must receive exactly `sgdAmountMinor`.
 * USDC needed = (amount + fee) / clientRate, rounded up to the next micro-USDC
 * so the treasury never under-funds a payout.
 */
export function quoteSgdPayout(
  sgdAmountMinor: bigint,
  rail: SgRail,
  cfg: FxConfig = DEFAULT_FX_CONFIG,
  now: Date = new Date()
): PayoutQuote {
  if (sgdAmountMinor <= 0n) throw new Error("Amount must be positive")
  const clientRateMicro = (cfg.midRateMicro * (10_000n - cfg.spreadBps)) / 10_000n
  const feeSgdMinor = cfg.feeSgdMinor[rail]
  const totalSgdMinor = sgdAmountMinor + feeSgdMinor
  // usdcMinor = totalSgd / rate * 10^6, with SGD in cents and rate scaled by 1e6
  const numerator = totalSgdMinor * 10n ** BigInt(USDC_DECIMALS) * RATE_SCALE
  const denominator = clientRateMicro * 10n ** BigInt(SGD_DECIMALS)
  return {
    rail,
    sgdAmountMinor,
    feeSgdMinor,
    usdcAmountMinor: ceilDiv(numerator, denominator),
    midRateMicro: cfg.midRateMicro,
    clientRateMicro,
    spreadBps: cfg.spreadBps,
    expiresAt: new Date(now.getTime() + QUOTE_TTL_MS),
    simulated: true,
  }
}

export function formatRate(rateMicro: bigint): string {
  const whole = rateMicro / RATE_SCALE
  const frac = (rateMicro % RATE_SCALE).toString().padStart(6, "0").slice(0, 4)
  return `${whole}.${frac}`
}

/** JSON-safe version (bigints become strings) for API responses. */
export function serializeQuote(q: PayoutQuote) {
  return {
    rail: q.rail,
    sgdAmountMinor: q.sgdAmountMinor.toString(),
    feeSgdMinor: q.feeSgdMinor.toString(),
    usdcAmountMinor: q.usdcAmountMinor.toString(),
    midRate: formatRate(q.midRateMicro),
    clientRate: formatRate(q.clientRateMicro),
    spreadBps: Number(q.spreadBps),
    expiresAt: q.expiresAt.toISOString(),
    simulated: q.simulated,
  }
}

export type SerializedQuote = ReturnType<typeof serializeQuote>
