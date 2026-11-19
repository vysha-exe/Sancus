import { describe, expect, it } from "vitest"
import type { CompanyNode } from "@/lib/sancus/companies"
import { calculateCompanyNodeTotal } from "@/lib/sancus/company-total"

describe("branch balance display", () => {
  it("combines the local bank account and wallet liquidity in local currency", () => {
    const node = {
      id: "jakarta",
      name: "Lion City Jakarta",
      country: "ID",
      currency: "IDR",
      parentId: "parent",
      ownMinor: "1000000",
      totalMinor: "1000000",
      wallets: [{ id: "wallet", address: "0x1" }],
      children: [],
      bankBalance: {
        balanceMinor: "3200000",
        currency: "IDR",
        bankName: "Bank Central Asia",
      },
    } as unknown as CompanyNode

    expect(calculateCompanyNodeTotal(node)).toEqual({
      currency: "IDR",
      bankMinor: "32000000000",
      walletMinor: "16000000000",
      totalMinor: "48000000000",
    })

    expect(calculateCompanyNodeTotal(node, "USD")).toEqual({
      currency: "USD",
      bankMinor: "2000000",
      walletMinor: "1000000",
      totalMinor: "3000000",
    })
  })
})
