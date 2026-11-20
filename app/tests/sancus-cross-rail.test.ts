import { describe, expect, it } from "vitest"
import {
  FUNDING_SOURCES,
  VENDORS,
  defaultSourceFor,
  isCrossRailCode,
  parsePaymentQr,
  parsePos,
  posUrl,
  quoteCrossRail,
  readReference,
  vendorForQr,
  vendorQr,
} from "@/lib/sancus/cross-rail"

describe("cross-rail vendor codes", () => {
  for (const v of VENDORS.filter((x) => x.rail !== "CARD")) {
    it(`${v.rail} terminal code keeps a valid CRC and carries its reference`, () => {
      const code = vendorQr(v, v.sampleAmount, "SXTEST1234")
      const qr = parsePaymentQr(code)
      expect(qr.scheme).toBe(v.rail)
      expect(qr.crcValid).toBe(true)
      expect(qr.amount).toBe(v.sampleAmount)
      expect(readReference(code)).toBe("SXTEST1234")
      expect(vendorForQr(qr)?.id).toBe(v.id)
      expect(isCrossRailCode(code)).toBe(true)
    })
  }

  it("card terminal links round-trip", () => {
    const url = posUrl("https://sancus.example", { t: "SXCARD0001", m: "harbor-pine", a: "64.20" })
    expect(parsePos(url)).toEqual({ v: 1, t: "SXCARD0001", m: "harbor-pine", a: "64.20" })
    expect(isCrossRailCode(url)).toBe(true)
    expect(parsePos("https://sancus.example/pay/scan-personal?pos=garbage")).toBeNull()
  })
})

describe("cross-rail quote", () => {
  const pix = VENDORS.find((v) => v.rail === "PIX")!
  it("defaults a US payer to their card", () => {
    expect(defaultSourceFor("US").rail).toBe("CARD")
  })
  it("adds FX spread and both rail fees when crossing rails", () => {
    const q = quoteCrossRail(pix, 86.5, defaultSourceFor("US"))
    expect(q.needsFx).toBe(true)
    expect(q.sourceCurrency).toBe("USD")
    expect(q.sourceAmount).toBeCloseTo(86.5 / 5.4123 * 1.0035 + 0.8, 6)
  })
  it("same rail and currency: no FX, one fee", () => {
    const q = quoteCrossRail(pix, 100, FUNDING_SOURCES.find((s) => s.rail === "PIX")!)
    expect(q.needsFx).toBe(false)
    expect(q.sourceAmount).toBeCloseTo(100 + 0.8 * 5.4123, 6)
  })
})
