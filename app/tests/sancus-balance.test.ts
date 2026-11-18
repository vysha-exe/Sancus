import { describe, expect, it } from "vitest"
import { simulatedSpend, summarizeTreasury } from "@/lib/sancus/treasury"

const since = "2026-11-18T08:30:00Z"
const after = "2026-11-18T09:00:00Z"
const before = "2026-11-18T07:00:00Z"
const brl = 5_782_100n // 5.7821 BRL per USDC

describe("simulated spend", () => {
  it("counts settled simulated payments and holds in-progress ACH", () => {
    const r = simulatedSpend({
      since,
      brlRateMicro: brl,
      payouts: [{ status: "COMPLETED", usdc_amount_minor: "1000000", tx_hash: null, simulated: true, created_at: after }],
      ach: [
        { status: "PAYMENT_PROCESSED", usdc_amount_minor: "2500000", funded_onchain: false, created_at: after },
        { status: "PAYMENT_SUBMITTED", usdc_amount_minor: "4000000", funded_onchain: false, created_at: after },
        { status: "RETURNED", usdc_amount_minor: "9000000", funded_onchain: false, created_at: after }, // money came back
        { status: "PAYMENT_PROCESSED", usdc_amount_minor: "7000000", funded_onchain: true, created_at: after }, // real USDC left onchain
      ],
      pix: [{ status: "SETTLED", amount_brl_minor: "57821", created_at: after }], // R$ 578,21 = $100 + $0.80 fee
    })
    expect(r.spentMinor).toBe(1_000_000n + 2_500_000n + 100_800_000n)
    expect(r.heldMinor).toBe(4_000_000n)
  })

  it("ignores payments from before the balance start", () => {
    const r = simulatedSpend({
      since,
      brlRateMicro: brl,
      payouts: [{ status: "COMPLETED", usdc_amount_minor: "1871000000", tx_hash: null, simulated: true, created_at: before }],
      ach: [{ status: "PAYMENT_PROCESSED", usdc_amount_minor: "1505000000", funded_onchain: false, created_at: before }],
      pix: [],
    })
    expect(r).toEqual({ spentMinor: 0n, heldMinor: 0n })
  })

  it("does not take settled simulated spend off Available (USDC is still onchain)", () => {
    const s = summarizeTreasury({
      wallets: [{ walletId: "w", name: "Global treasury", address: "0x1", blockchain: "ARC-TESTNET", usdcMinor: 10_000_000n }],
      gatewayMinor: 0n,
      payouts: [],
      ledgerRows: [],
      simulated: { spentMinor: 2_500_000n, heldMinor: 0n },
    })
    expect([s.totalMinor, s.availableMinor, s.simulatedSpentMinor]).toEqual(["10000000", "10000000", "2500000"])
  })

  it("holds in-progress simulated ACH against Available", () => {
    const s = summarizeTreasury({
      wallets: [{ walletId: "w", name: "Global treasury", address: "0x1", blockchain: "ARC-TESTNET", usdcMinor: 10_000_000n }],
      gatewayMinor: 0n,
      payouts: [],
      ledgerRows: [],
      simulated: { spentMinor: 2_500_000n, heldMinor: 4_000_000n },
    })
    expect(s.availableMinor).toBe("6000000")
    expect(s.reservedMinor).toBe("4000000")
  })
})
