import { describe, expect, it } from "vitest"
import { accountBalances, feeShareUsdc, isBalanced, payoutJournal, type PayoutForLedger } from "@/lib/sancus/ledger"

const payout: PayoutForLedger = {
  id: "p1",
  rail: "PAYNOW",
  usdcAmountMinor: 1_497_402_656n, // S$2,000 + S$0.50 fee
  sgdAmountMinor: 200_000n,
  feeSgdMinor: 50n,
  recipientName: "Lim Trading",
}

describe("sancus ledger", () => {
  it("builds balanced journals for every payout event", () => {
    for (const event of ["created", "completed", "failed"] as const) {
      expect(isBalanced(payoutJournal(event, payout).entries)).toBe(true)
    }
  })

  it("moves funds available → in transit → recipient + fee", () => {
    const rows = ["created", "completed"].flatMap((e) =>
      payoutJournal(e as "created" | "completed", payout).entries.map((x) => ({
        account: x.account,
        direction: x.direction,
        amount_minor: x.amountMinor.toString(),
      }))
    )
    const b = accountBalances(rows)
    expect(b["payouts:in_transit"]).toBe(0n)
    expect(b["treasury:available"]).toBe(-1_497_402_656n)
    expect(b["external:paynow"]! + b["fees:partner"]!).toBe(1_497_402_656n)
    expect(b["fees:partner"]).toBe(feeShareUsdc(payout))
  })

  it("releases funds back to available when a payout fails", () => {
    const rows = ["created", "failed"].flatMap((e) =>
      payoutJournal(e as "created" | "failed", payout).entries.map((x) => ({
        account: x.account,
        direction: x.direction,
        amount_minor: x.amountMinor.toString(),
      }))
    )
    const b = accountBalances(rows)
    expect(b["treasury:available"]).toBe(0n)
    expect(b["payouts:in_transit"]).toBe(0n)
  })

  it("splits the fee proportionally and never exceeds the payout", () => {
    // fee share = 1497.402656 * 0.50 / 2000.50 ≈ 0.374257 USDC, rounded up
    expect(feeShareUsdc(payout)).toBe(374_258n)
    expect(feeShareUsdc({ ...payout, feeSgdMinor: 0n })).toBe(0n)
  })

  it("rejects unbalanced or empty journals", () => {
    expect(isBalanced([])).toBe(false)
    expect(
      isBalanced([
        { account: "a", direction: "DEBIT", amountMinor: 5n },
        { account: "b", direction: "CREDIT", amountMinor: 4n },
      ])
    ).toBe(false)
  })
})
