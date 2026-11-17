import { describe, expect, it } from "vitest"
import { displayMinor, formatMinor, parseToMinor } from "@/lib/sancus/money"
import { DEFAULT_FX_CONFIG, formatRate, fxConfigFromEnv, quoteSgdPayout } from "@/lib/sancus/fx"

describe("sancus money", () => {
  it("parses decimal input into minor units", () => {
    expect(parseToMinor("2000", 2)).toBe(200000n)
    expect(parseToMinor("1,234.5", 2)).toBe(123450n)
    expect(parseToMinor("0.01", 2)).toBe(1n)
    expect(parseToMinor("100.123456", 6)).toBe(100123456n)
  })

  it("rejects invalid or over-precise input", () => {
    expect(parseToMinor("abc", 2)).toBeNull()
    expect(parseToMinor("1.234", 2)).toBeNull()
    expect(parseToMinor("-5", 2)).toBeNull()
    expect(parseToMinor("", 2)).toBeNull()
  })

  it("formats minor units", () => {
    expect(formatMinor(100000000n, 6)).toBe("100.000000")
    expect(formatMinor(5n, 2)).toBe("0.05")
    expect(displayMinor(123456789n, 2, "S$")).toBe("S$1,234,567.89")
  })
})

describe("sancus fx quotes", () => {
  const noSpread = { ...DEFAULT_FX_CONFIG, spreadBps: 0n, feeSgdMinor: { PAYNOW: 0n, FAST: 0n } }

  it("converts SGD to USDC at the mid rate with no spread or fee", () => {
    // S$134.00 at 1.34 = 100 USDC
    const q = quoteSgdPayout(13400n, "PAYNOW", noSpread)
    expect(q.usdcAmountMinor).toBe(100_000_000n)
  })

  it("adds the fee and spread, and rounds USDC up", () => {
    const q = quoteSgdPayout(200000n, "PAYNOW") // S$2,000 + S$0.50 fee at 1.34 * (1 - 0.003)
    expect(q.feeSgdMinor).toBe(50n)
    expect(q.clientRateMicro).toBe(1_335_980n)
    // S$2,000.50 / 1.33598 = 1497.4026557... USDC, rounded up to the next micro-USDC
    expect(q.usdcAmountMinor).toBe(1_497_402_656n)
    expect(q.usdcAmountMinor * q.clientRateMicro).toBeGreaterThanOrEqual(200050n * 10n ** 10n)
  })

  it("expires after 60 seconds", () => {
    const now = new Date("2026-11-17T00:00:00Z")
    const q = quoteSgdPayout(1000n, "FAST", DEFAULT_FX_CONFIG, now)
    expect(q.expiresAt.getTime() - now.getTime()).toBe(60_000)
  })

  it("rejects non-positive amounts", () => {
    expect(() => quoteSgdPayout(0n, "PAYNOW")).toThrow()
  })

  it("reads rate overrides from env and ignores bad values", () => {
    expect(fxConfigFromEnv({ SANCUS_USD_SGD_RATE: "1.2875" }).midRateMicro).toBe(1_287_500n)
    expect(fxConfigFromEnv({ SANCUS_USD_SGD_RATE: "nope" }).midRateMicro).toBe(1_340_000n)
    expect(fxConfigFromEnv({ SANCUS_FX_SPREAD_BPS: "50" }).spreadBps).toBe(50n)
    expect(formatRate(1_335_980n)).toBe("1.3359")
  })
})
