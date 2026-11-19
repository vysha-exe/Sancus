import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { equityBuyQuote, equitySellQuote } from "@/lib/sancus/treasury-equities"
import { accountBalances, equityAllocationJournal, gatewayMintJournal, isBalanced, yieldAllocationJournal } from "@/lib/sancus/ledger"

describe("parent treasury equity quotes", () => {
  it("quotes a deterministic fractional-share purchase in fUSDC", () => {
    const quote = equityBuyQuote("NVDA", "25", 140_000_000n)
    expect(quote.usdcMinor).toBe(25_000_000n)
    expect(quote.shares).toBe(178_571_428_571_428_571n)
  })

  it("quotes a share sale back into fUSDC", () => {
    const quote = equitySellQuote("GOOGL", "0.5", 180_000_000n)
    expect(quote.shares).toBe(500_000_000_000_000_000n)
    expect(quote.usdcMinor).toBe(90_000_000n)
  })

  it("rejects zero-sized allocations", () => {
    expect(() => equityBuyQuote("NVDA", "0", 140_000_000n)).toThrow("too small")
  })

  it("keeps Gateway, canonical USDC, and fUSDC in separate ledger accounts", () => {
    const journals = [
      gatewayMintJournal("move", 3_000_000n),
      yieldAllocationJournal("yield", "DEPOSIT", 2_000_000n),
      equityAllocationJournal("equity", "BUY", 1_000_000n, "NVDA"),
    ]
    expect(journals.every((journal) => isBalanced(journal.entries))).toBe(true)
    const balances = accountBalances(journals.flatMap((journal) => journal.entries.map((entry) => ({
      account: `${entry.currency ?? "USDC"}:${entry.account}`,
      direction: entry.direction,
      amount_minor: entry.amountMinor.toString(),
    }))))
    expect(balances["USDC:treasury:gateway_usdc"]).toBe(-3_000_000n)
    expect(balances["USDC:assets:allocation_usdc"]).toBe(2_000_000n)
    expect(balances["fUSDC:assets:allocation_fusdc"]).toBe(1_000_000n)
  })

  it("shows parent fUSDC separately on the bank-first home dashboard", () => {
    const home = readFileSync(new URL("../app/(sancus)/home/page.tsx", import.meta.url), "utf8")
    const balance = readFileSync(new URL("../components/sancus-ui/home-balance.tsx", import.meta.url), "utf8")
    expect(home).toContain('/api/sancus/treasury/root')
    expect(home).toContain('/api/sancus/treasury/equities')
    expect(home).toContain('/api/sancus/treasury/yield')
    expect(balance).toContain("Treasury portfolio history")
    expect(balance).toContain("equityMinor")
    expect(balance).toContain("yieldMinor")
  })
})
