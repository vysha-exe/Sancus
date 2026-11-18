import { describe, expect, it } from "vitest"
import { summarizeTreasury, type TreasuryInputs } from "@/lib/sancus/treasury"
import { payoutJournal } from "@/lib/sancus/ledger"

const wallet = (usdcMinor: bigint | null) => ({
  walletId: "w1",
  name: "Treasury",
  address: "0xabc",
  blockchain: "ARC-TESTNET",
  usdcMinor,
})

const entriesFor = (...journals: ReturnType<typeof payoutJournal>[]) =>
  journals.flatMap((j) =>
    j.entries.map((e) => ({ account: e.account, direction: e.direction, amount_minor: e.amountMinor.toString() }))
  )

const p = (id: string, usdc: bigint) => ({
  id,
  rail: "PAYNOW",
  usdcAmountMinor: usdc,
  sgdAmountMinor: 100_00n,
  feeSgdMinor: 50n,
  recipientName: "x",
})

describe("treasury summary", () => {
  it("adds wallets and Gateway, and reserves unsent in-flight payouts", () => {
    const input: TreasuryInputs = {
      wallets: [wallet(10_000_000_000n)], // 10,000 USDC
      gatewayMinor: 2_500_000_000n, // 2,500 USDC
      payouts: [
        { status: "CONVERTING", usdc_amount_minor: "1000000000", tx_hash: null, simulated: true }, // reserved 1,000
        { status: "PAYING_OUT", usdc_amount_minor: "500000000", tx_hash: "0xtx", simulated: false }, // in flight 500
        { status: "COMPLETED", usdc_amount_minor: "200000000", tx_hash: null, simulated: true },
      ],
      ledgerRows: entriesFor(
        payoutJournal("created", p("a", 1_000_000_000n)),
        payoutJournal("created", p("b", 500_000_000n)),
        payoutJournal("created", p("c", 200_000_000n)),
        payoutJournal("completed", p("c", 200_000_000n))
      ),
    }
    const s = summarizeTreasury(input)
    expect(s.totalMinor).toBe("12500000000")
    expect(s.reservedMinor).toBe("1000000000")
    expect(s.inFlightMinor).toBe("500000000")
    expect(s.availableMinor).toBe("11500000000")
    expect(s.payouts.inFlightCount).toBe(2)
    expect(s.payouts.simulatedDeliveredMinor).toBe("200000000")
    expect(s.ledger.inSync).toBe(true)
    expect(s.warnings).toEqual([])
  })

  it("flags unreadable balances, overcommitment and ledger drift", () => {
    const s = summarizeTreasury({
      wallets: [wallet(null), wallet(100n)],
      gatewayMinor: null,
      payouts: [{ status: "CREATED", usdc_amount_minor: "500", tx_hash: null, simulated: true }],
      ledgerRows: [],
    })
    expect(s.availableMinor).toBe("0")
    expect(s.gatewayMinor).toBeNull()
    expect(s.ledger.inSync).toBe(false)
    expect(s.warnings.length).toBeGreaterThanOrEqual(3)
  })
})
