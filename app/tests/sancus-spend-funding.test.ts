import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { fundingTokenMinor } from "@/lib/sancus/spend-funding-values"

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

describe("employee spend funding", () => {
  it("uses local-token minor units and converts USD cents to fUSDC units", () => {
    expect(fundingTokenMinor("BRL", 1_025n)).toBe(1_025n)
    expect(fundingTokenMinor("IDR", 150_000n)).toBe(150_000n)
    expect(fundingTokenMinor("USD", 2_500n)).toBe(25_000_000n)
  })

  it("persists the issuing company and operating bank account on cards and Pix access", () => {
    for (const route of ["app/api/sancus/cards/route.ts", "app/api/sancus/spending-methods/route.ts"]) {
      const text = source(route)
      expect(text).toContain("resolveEmployeeFundingAccount")
      expect(text).toContain("company_id: funding.companyId")
      expect(text).toContain("funding_account_id: funding.accountId")
    }
  })

  it("reserves branch funds and releases failed card and Pix holds", () => {
    const spend = source("app/api/sancus/dev/spend/route.ts")
    const refresh = source("app/api/sancus/dev/spend/[id]/route.ts")
    expect(spend).toContain("reserveSpendFunds")
    expect(spend).toContain("releaseSpendFunds")
    expect(spend).toContain('funding_status: settled ? "SETTLED" : "RELEASED"')
    expect(refresh).toContain('data.funding_status === "HELD"')
    expect(refresh).toContain('funding_status: status === "SETTLED"')
  })
})
