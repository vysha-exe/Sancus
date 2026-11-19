import { describe, expect, it } from "vitest"
import { BUILT_IN_PIX_MERCHANT, withBuiltInPixMerchant } from "@/lib/sancus/dev-pix-merchant"
import { parsePaymentQr } from "@/lib/sancus/emv-qr"

describe("built-in Dev merchant Pix QR", () => {
  it("is a valid Pix EMV code with stable PayZu sandbox metadata", () => {
    const parsed = parsePaymentQr(BUILT_IN_PIX_MERCHANT.payload)

    expect(parsed.scheme).toBe("PIX")
    expect(parsed.crcValid).toBe(true)
    expect(parsed.currency).toBe("BRL")
    expect(parsed.proxy).toEqual({ type: "PIX_KEY", value: "merchant@sancus.test" })
    expect(BUILT_IN_PIX_MERCHANT.amountEditable).toBe(false)
    expect(BUILT_IN_PIX_MERCHANT.fixedAmountBrlMinor).toBe("13931")
  })

  it("is always first and is not duplicated", () => {
    expect(withBuiltInPixMerchant([])).toEqual([BUILT_IN_PIX_MERCHANT])
    expect(withBuiltInPixMerchant([BUILT_IN_PIX_MERCHANT])).toEqual([BUILT_IN_PIX_MERCHANT])
  })
})
