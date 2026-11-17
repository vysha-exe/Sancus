import { describe, expect, it } from "vitest"
import {
  chooseRail,
  isValidUen,
  maskProxy,
  normaliseRecipient,
  normaliseSgMobile,
  validateRecipient,
} from "@/lib/sancus/paynow"
import {
  simulatedStatusAt,
  SIM_FAIL_AMOUNT_SGD_MINOR,
  type ProviderPayout,
} from "@/lib/sancus/payout-provider"

describe("singapore recipients", () => {
  it("normalises mobile numbers", () => {
    expect(normaliseSgMobile("9123 4567")).toBe("+6591234567")
    expect(normaliseSgMobile("+65 8123-4567")).toBe("+6581234567")
    expect(normaliseSgMobile("6123 4567")).toBeNull() // landline
    expect(normaliseSgMobile("912345")).toBeNull()
  })

  it("accepts the three UEN formats", () => {
    expect(isValidUen("53123456A")).toBe(true)
    expect(isValidUen("201912345k")).toBe(true)
    expect(isValidUen("T09LL0001B")).toBe(true)
    expect(isValidUen("12345")).toBe(false)
  })

  it("validates bank recipients need a SWIFT code", () => {
    const errors = validateRecipient({ name: "Acme", proxyType: "BANK", proxyValue: "0123456789" })
    expect(errors.map((e) => e.field)).toEqual(["bankCode"])
    expect(
      validateRecipient({ name: "Acme", proxyType: "BANK", proxyValue: "0123456789", bankCode: "DBSSSGSG" })
    ).toEqual([])
  })

  it("requires a name", () => {
    expect(validateRecipient({ name: " ", proxyType: "UEN", proxyValue: "201912345K" })[0].field).toBe("name")
  })

  it("routes proxies to PayNow and bank accounts to FAST", () => {
    expect(chooseRail({ name: "a", proxyType: "MOBILE", proxyValue: "+6591234567" }).rail).toBe("PAYNOW")
    expect(chooseRail({ name: "a", proxyType: "UEN", proxyValue: "201912345K" }).rail).toBe("PAYNOW")
    expect(chooseRail({ name: "a", proxyType: "BANK", proxyValue: "0123456789" }).rail).toBe("FAST")
  })

  it("normalises and masks", () => {
    const r = normaliseRecipient({ name: " Lim Supplies ", proxyType: "MOBILE", proxyValue: "9123 4567" })
    expect(r).toMatchObject({ name: "Lim Supplies", proxyValue: "+6591234567" })
    expect(maskProxy(r)).toBe("•••••••4567")
  })
})

describe("simulated payout lifecycle", () => {
  const created = new Date("2026-11-17T00:00:00Z")
  const base: ProviderPayout = { id: "abc", rail: "PAYNOW", status: "CREATED", createdAt: created, sgdAmountMinor: 200000n }
  const at = (s: number) => new Date(created.getTime() + s * 1000)

  it("walks through each step over time", () => {
    expect(simulatedStatusAt(base, at(0))).toBe("CREATED")
    expect(simulatedStatusAt(base, at(3))).toBe("FUNDS_SENT")
    expect(simulatedStatusAt(base, at(6))).toBe("CONVERTING")
    expect(simulatedStatusAt(base, at(10))).toBe("PAYING_OUT")
    expect(simulatedStatusAt(base, at(20))).toBe("COMPLETED")
  })

  it("never moves backwards or out of a terminal state", () => {
    expect(simulatedStatusAt({ ...base, status: "CONVERTING" }, at(0))).toBe("CONVERTING")
    expect(simulatedStatusAt({ ...base, status: "FAILED" }, at(20))).toBe("FAILED")
  })

  it("fails the magic S$13.13 amount at the payout step", () => {
    const failing = { ...base, sgdAmountMinor: SIM_FAIL_AMOUNT_SGD_MINOR }
    expect(simulatedStatusAt(failing, at(10))).toBe("PAYING_OUT")
    expect(simulatedStatusAt(failing, at(20))).toBe("FAILED")
  })
})
