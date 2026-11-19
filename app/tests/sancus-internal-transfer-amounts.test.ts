import { describe, expect, it } from "vitest"
import { localMinorForUsdc } from "@/lib/sancus/internal-transfers"

describe("localMinorForUsdc", () => {
  it("keeps USDC in 6-decimal units (HQ wallet)", () => {
    expect(localMinorForUsdc(1_000_000n, "USDC")).toBe(1_000_000n)
  })

  it("converts to 2-decimal bank units for every branch currency, USD included", () => {
    expect(localMinorForUsdc(1_000_000n, "USD")).toBe(100n) // $1.00, not $10,000
    expect(localMinorForUsdc(1_000_000n, "THB")).toBe(3_500n) // ฿35.00
    expect(localMinorForUsdc(2_000_000n, "IDR")).toBe(3_200_000n) // Rp 32,000.00
  })
})
