import { describe, expect, it } from "vitest"
import { encodeReceiveCode, parseReceiveCode } from "@/lib/sancus/receive-code"

describe("reusable receive codes", () => {
  const companyId = "2f867338-9179-46cf-b411-d84dec216e65"

  it("contains the branch and rail but never an amount", () => {
    const value = encodeReceiveCode({ rail: "QRIS", companyId })

    expect(value).toContain("rail=QRIS")
    expect(value).toContain(`company=${companyId}`)
    expect(value).not.toContain("amount")
    expect(parseReceiveCode(value)).toEqual({ rail: "QRIS", companyId })
  })

  it("rejects non-Sancus and malformed receive identities", () => {
    expect(parseReceiveCode("https://example.com/pay")).toBeNull()
    expect(parseReceiveCode("sancus://receive/v1?rail=PIX&company=not-a-uuid")).toBeNull()
  })
})
