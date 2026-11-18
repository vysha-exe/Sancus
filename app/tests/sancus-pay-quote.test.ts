import { describe, expect, it } from "vitest"
import { quotePay, serializePayQuote } from "@/lib/sancus/pay-quote"

const q = (input: Parameters<typeof quotePay>[0]) => {
  const r = quotePay(input)
  if (!r.ok) throw new Error(r.error)
  return serializePayQuote(r.quote)
}

describe("pay quote (USDC-based)", () => {
  it("USDC recipients get exactly what you send, no conversion, no fee", () => {
    const x = q({ rail: "USDC", side: "send", amount: "250.00" })
    expect([x.currency, x.receiveLabel, x.feeLabel, x.converted, x.rateLabel]).toEqual(["USDC", "250.00 USDC", "$0.00", false, "USDC to USDC · no conversion"])
  })

  it("ACH redeems USDC to USD 1:1", () => {
    const x = q({ rail: "ACH", side: "send", amount: "2000" })
    expect([x.currency, x.receiveLabel, x.rateLabel]).toEqual(["USD", "$2,000.00", "1 USDC = 1 USD · redeemed 1:1"])
  })

  it("Pix converts USDC to BRL after the fee", () => {
    const x = q({ rail: "Pix", side: "send", amount: "100.80" }) // 100.00 converts, 0.80 fee
    expect(x.amountLabel).toBe("$100.00")
    expect(x.receiveMinor).toBe("54123") // R$ 541,23
    expect(x.rateLabel).toBe("1 USDC = 5.4123 BRL")
  })

  it("works backwards from what they get, rounding so they never get less", () => {
    const x = q({ rail: "SEPA", side: "receive", amount: "1.840,00" }) // € 1.840,00
    expect(x.currency).toBe("EUR")
    expect(x.receiveMinor).toBe("184000")
    const back = q({ rail: "SEPA", side: "send", amount: x.sendInput })
    expect(Number(back.receiveMinor)).toBeGreaterThanOrEqual(184000)
  })

  it("a wire follows the recipient's currency; bad input is refused", () => {
    expect(q({ rail: "Wire", currency: "BRL", side: "send", amount: "103.50" }).receiveMinor).toBe("54123")
    expect(quotePay({ rail: "Pix", currency: "EUR", side: "send", amount: "10" }).ok).toBe(false)
    expect(quotePay({ rail: "Pix", side: "send", amount: "0.50" }).ok).toBe(false) // below the fee
    expect(quotePay({ rail: "USDC", side: "send", amount: "abc" }).ok).toBe(false)
  })
})
