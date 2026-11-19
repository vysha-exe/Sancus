import { describe, expect, it } from "vitest"
import { sandboxReceiveAccount } from "@/lib/sancus/receive-accounts"

describe("sandbox receive accounts", () => {
  it("provides US routing and account details for a branch", () => {
    const account = sandboxReceiveAccount({
      id: "a075432d-152d-48cb-be2c-768cc48506b6",
      name: "Lion City US",
      country: "US",
      currency: "USD",
    })

    expect(account.bankName).toBe("JPMorgan Chase")
    expect(account.routingLabel).toBe("Routing number")
    expect(account.routingValue).toBe("021000021")
    expect(account.accountNumber).toMatch(/^\d{12}$/)
    expect(account.accountName).toBe("Lion City US")
    expect(account.simulated).toBe(true)
  })

  it("uses local routing conventions for regional branches", () => {
    const account = sandboxReceiveAccount({
      id: "a075432d-152d-48cb-be2c-768cc48506b6",
      name: "Lion City Indonesia",
      country: "ID",
      currency: "IDR",
    })

    expect(account.bankName).toBe("Bank Central Asia")
    expect(account.routingLabel).toBe("Bank code")
    expect(account.routingValue).toBe("014")
    expect(account.currency).toBe("IDR")
  })

  it("falls back without omitting required transfer fields", () => {
    const account = sandboxReceiveAccount({
      id: "00000000-0000-0000-0000-000000000001",
      name: "New branch",
      country: "ZZ",
      currency: "USD",
    })

    expect(account.bankName).toBe("Local operating bank")
    expect(account.routingValue).toBe("SANCUS00")
    expect(account.accountNumber).toHaveLength(12)
  })
})
