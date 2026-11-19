import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
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

  it("creates the expected THB operating account for Bangkok", () => {
    const account = sandboxReceiveAccount({
      id: "f64e7840-a66e-408f-8175-c22cc53853f5",
      name: "Lion City Bangkok",
      country: "TH",
      currency: "THB",
    })

    expect(account.bankName).toBe("Kasikornbank")
    expect(account.routingValue).toBe("004")
    expect(account.currency).toBe("THB")
  })

  it("auto-provisions missing branch accounts before internal transfers", () => {
    const source = readFileSync(new URL("../app/api/sancus/internal-transfers/route.ts", import.meta.url), "utf8")
    expect(source).toContain("ensureCompanyReceiveAccount")
    expect(source).toContain("account.account_type")
    expect(source).toContain("account.account_number.slice(-4)")
    expect(source).not.toContain('.select("id, bank_name, account_label, account_last4, currency")')
  })
})
