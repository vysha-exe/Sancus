import { describe, expect, it } from "vitest"
import { DEFAULT_POLICY, evaluatePayout, isBlocked, policyFromRow, type Policy } from "@/lib/sancus/policy"

const policy: Policy = { ...DEFAULT_POLICY, blockedRecipients: ["Shady Corp", "+65 8888 0000"] }
const lim = { name: "Lim Trading Pte Ltd", proxyValue: "201912345K" }
const usdc = (dollars: number) => BigInt(Math.round(dollars * 1_000_000))

describe("sancus policy engine", () => {
  it("allows payouts under the approval threshold", () => {
    expect(evaluatePayout({ policy, amountMinor: usdc(374.63), recipient: lim, spentTodayMinor: 0n })).toEqual({
      decision: "ALLOW",
      reason: null,
    })
  })

  it("sends payouts at or over $1,000 to approval", () => {
    const e = evaluatePayout({ policy, amountMinor: usdc(1000), recipient: lim, spentTodayMinor: 0n })
    expect(e.decision).toBe("NEEDS_APPROVAL")
    expect(e.reason).toContain("$1,000.00")
  })

  it("blocks recipients on the blocklist by name or proxy, ignoring case and spaces", () => {
    expect(isBlocked(policy, { name: "shady corp", proxyValue: "x" })).toBe(true)
    expect(isBlocked(policy, { name: "Someone", proxyValue: "+6588880000" })).toBe(true)
    expect(evaluatePayout({ policy, amountMinor: usdc(10), recipient: { name: "SHADY CORP", proxyValue: "x" }, spentTodayMinor: 0n }).decision).toBe("BLOCK")
  })

  it("blocks over the per-payment limit", () => {
    const e = evaluatePayout({ policy, amountMinor: usdc(50_000.01), recipient: lim, spentTodayMinor: 0n })
    expect(e.decision).toBe("BLOCK")
    expect(e.reason).toContain("per-payment")
  })

  it("blocks when today's total would pass the daily limit", () => {
    const e = evaluatePayout({ policy, amountMinor: usdc(30_000), recipient: lim, spentTodayMinor: usdc(80_000) })
    expect(e.decision).toBe("BLOCK")
    expect(e.reason).toContain("$20,000.00 left today")
  })

  it("uses defaults when there is no policy row, and parses stored rows", () => {
    expect(policyFromRow(null)).toEqual(DEFAULT_POLICY)
    expect(
      policyFromRow({
        approval_threshold_minor: "500000000",
        per_payment_limit_minor: 1_000_000_000,
        daily_limit_minor: "2000000000",
        blocked_recipients: null,
      })
    ).toEqual({
      approvalThresholdMinor: 500_000_000n,
      perPaymentLimitMinor: 1_000_000_000n,
      dailyLimitMinor: 2_000_000_000n,
      blockedRecipients: [],
    })
  })
})
