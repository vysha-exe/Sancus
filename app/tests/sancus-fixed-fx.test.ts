import { describe, expect, it } from "vitest"
import {
  bankMinorFromTransportMinor,
  quoteFixedFx,
  transportMinorFromBankMinor,
} from "@/lib/sancus/mock-fx"

describe("fixed Arc FX", () => {
  it("matches the contract's BRL to THB integer rounding", () => {
    expect(quoteFixedFx("BRL", "THB", 5_412n)).toBe(34_998n)
  })

  it("uses fUSDC precision for USD bank accounts", () => {
    const tenUsd = transportMinorFromBankMinor("USD", 1_000n)
    expect(tenUsd).toBe(10_000_000n)
    expect(quoteFixedFx("USD", "BRL", tenUsd)).toBe(5_412n)
    expect(bankMinorFromTransportMinor("USD", quoteFixedFx("BRL", "USD", 5_412n))).toBe(1_000n)
  })

  it("moves same-currency corridors one for one", () => {
    expect(quoteFixedFx("IDR", "IDR", 3_200_000n)).toBe(3_200_000n)
  })

  it("rejects currencies without a deployed test token", () => {
    expect(() => quoteFixedFx("SGD", "THB", 100n)).toThrow("Fixed FX does not support SGD")
  })
})
