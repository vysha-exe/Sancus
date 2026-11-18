import { describe, expect, it } from "vitest"
import {
  ARC_TESTNET_GATEWAY_WALLET,
  ARC_TESTNET_NETWORK,
  buildRequirements,
  decodeHeader,
  encodeHeader,
  paymentRequired,
  priceToMinor,
} from "@/lib/sancus/x402"
import { isBalanced, x402Journal, accountBalances } from "@/lib/sancus/ledger"
import { routeQuote } from "@/lib/sancus/route-quote"

const payTo = "0x1111111111111111111111111111111111111111"

describe("x402 payment terms", () => {
  it("prices in USDC minor units", () => {
    expect(priceToMinor("0.01")).toBe(10_000n)
    expect(priceToMinor("$0.001")).toBe(1_000n)
    expect(() => priceToMinor("0")).toThrow()
  })

  it("builds Circle Gateway batched requirements on Arc testnet", () => {
    const r = buildRequirements(payTo, 10_000n)
    expect(r).toMatchObject({
      scheme: "exact",
      network: ARC_TESTNET_NETWORK,
      amount: "10000",
      payTo,
      extra: { name: "GatewayWalletBatched", verifyingContract: ARC_TESTNET_GATEWAY_WALLET },
    })
  })

  it("round-trips the base64 PAYMENT-REQUIRED header", () => {
    const terms = paymentRequired(
      { path: "/api/x402/route-quote", method: "GET", description: "Quote", price: "0.01" },
      buildRequirements(payTo, 10_000n)
    )
    expect(decodeHeader(encodeHeader(terms))).toEqual(terms)
    expect(terms.x402Version).toBe(2)
    expect(terms.accepts).toHaveLength(1)
  })

  it("posts x402 income as balanced revenue", () => {
    const j = x402Journal("e1", 10_000n, "/api/x402/route-quote")
    expect(isBalanced(j.entries)).toBe(true)
    const b = accountBalances(
      j.entries.map((e) => ({ account: e.account, direction: e.direction, amount_minor: e.amountMinor.toString() }))
    )
    expect(b["treasury:available"]).toBe(10_000n)
    expect(b["revenue:x402"]).toBe(-10_000n)
  })
})

describe("route quotes sold over x402", () => {
  const now = new Date("2026-11-17T00:00:00Z")

  it("picks PayNow for a UEN recipient in Singapore, priced like real payouts", () => {
    const r = routeQuote({ country: "SG", amount: "2000", recipientType: "UEN" }, {}, now)
    if (!r.ok) throw new Error(r.error)
    expect(r.body.best.rail).toBe("PayNow")
    expect(r.body.best.usdcCost).toBe("1,497.492328") // fixed 1 USD = 1.3359 SGD demo rate
    expect(r.body.live).toBe(true)
    expect(r.body.alternatives[0]).toMatchObject({ rail: "FAST", available: false })
  })

  it("picks FAST for a bank account", () => {
    const r = routeQuote({ country: "SG", amount: "500", recipientType: "BANK" }, {}, now)
    if (!r.ok) throw new Error(r.error)
    expect(r.body.best.rail).toBe("FAST")
  })

  it("returns indicative, simulated quotes for Indonesia and Thailand", () => {
    const id = routeQuote({ country: "id", amount: "1000000", recipientType: "BANK" }, {}, now)
    const th = routeQuote({ country: "TH", amount: "5000", recipientType: "MOBILE" }, { SANCUS_USD_THB_RATE: "36.50" }, now)
    if (!id.ok || !th.ok) throw new Error("expected quotes")
    expect(id.body).toMatchObject({ live: false, currency: "IDR" })
    expect(id.body.best).toMatchObject({ rail: "BI-FAST", simulated: true })
    expect(th.body.best.rate).toContain("35.0000")
  })

  it("rejects bad input", () => {
    expect(routeQuote({ country: "JP", amount: "1" }).ok).toBe(false)
    expect(routeQuote({ country: "SG", amount: "-5" }).ok).toBe(false)
    expect(routeQuote({ country: "SG", amount: "10", recipientType: "EMAIL" }).ok).toBe(false)
  })
})
