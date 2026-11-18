import { describe, expect, it } from "vitest"
import {
  ACH_ACCOUNTS,
  achJournalsFor,
  isValidRoutingNumber,
  normaliseRecipient,
  quoteAch,
  validateRecipient,
  type AchPaymentRow,
} from "@/lib/sancus/ach"
import { accountBalances, isBalanced } from "@/lib/sancus/ledger"
import { signWebhook, verifyWebhook } from "@/lib/sancus/ach-server"
import { addBusinessDays, canTransition, simulateAch, type SimPayment } from "@/lib/sancus/rails/ach-sim"

describe("US recipient validation", () => {
  it("checks the ABA routing checksum", () => {
    expect(isValidRoutingNumber("021000021")).toBe(true) // Chase
    expect(isValidRoutingNumber("121000248")).toBe(true) // Wells Fargo
    expect(isValidRoutingNumber("021000022")).toBe(false)
    expect(isValidRoutingNumber("12345")).toBe(false)
  })
  it("reports field issues and never keeps the full account number", () => {
    const bad = validateRecipient({ name: "A", routingNumber: "021000022", accountNumber: "12", accountType: "CHECKING", ownerType: "BUSINESS" })
    expect(bad.map((i) => i.field)).toEqual(["name", "routingNumber", "accountNumber"])
    const r = normaliseRecipient({ name: " Acme  Supply ", routingNumber: "021000021", accountNumber: "1234 5678 9012", accountType: "CHECKING", ownerType: "BUSINESS" })
    expect(r).toMatchObject({ name: "Acme Supply", bankName: "JPMorgan Chase", accountLast4: "9012" })
    expect(JSON.stringify(r)).not.toContain("123456789012")
  })
})

describe("ACH quote", () => {
  const opts = { settlementMode: "MOCK_ONLY" as const, demoMode: "accelerated" as const }
  it("is 1:1 plus a flat fee, in USDC minor units", () => {
    const q = quoteAch("2500.00", "STANDARD", opts)
    expect(q.ok && q.quote.usdcAmountMinor).toBe(2_500_500_000n) // $2,500 + $0.50 fee
    const s = quoteAch("10", "SAME_DAY", opts)
    expect(s.ok && s.quote.feeUsdMinor).toBe(100n)
  })
  it("rejects bad and out-of-range amounts", () => {
    expect(quoteAch("abc", "STANDARD", opts).ok).toBe(false)
    expect(quoteAch("0.50", "STANDARD", opts).ok).toBe(false)
    expect(quoteAch("100000.01", "STANDARD", opts).ok).toBe(false)
  })
})

describe("mock ACH lifecycle", () => {
  const t0 = new Date("2026-11-18T15:00:00Z") // a Wednesday
  const base: SimPayment = { status: "CREATED", speed: "STANDARD", demoMode: "accelerated", startedAt: t0, accountLast4: "4242", usdAmountMinor: 100_00n }
  const at = (s: number, p: Partial<SimPayment> = {}) => simulateAch({ ...base, ...p }, new Date(t0.getTime() + s * 1000)).status
  it("walks the accelerated timeline in ~12 seconds", () => {
    expect([at(0), at(3), at(6), at(12), at(60)]).toEqual(["CREATED", "FUNDS_RECEIVED", "PAYMENT_SUBMITTED", "PAYMENT_PROCESSED", "PAYMENT_PROCESSED"])
  })
  it("magic values: …0001 fails at submission, …0002 returns after settling, $13.13 fails", () => {
    expect(at(7, { accountLast4: "0001" })).toBe("FAILED")
    expect(at(12, { accountLast4: "0002" })).toBe("PAYMENT_PROCESSED")
    expect(simulateAch({ ...base, accountLast4: "0002" }, new Date(t0.getTime() + 20_000))).toEqual({ status: "RETURNED", returnCode: "R01" })
    expect(at(7, { usdAmountMinor: 13_13n })).toBe("FAILED")
  })
  it("realistic mode takes banking days and skips weekends", () => {
    expect(at(3600, { demoMode: "realistic" })).toBe("PAYMENT_SUBMITTED")
    expect(addBusinessDays(new Date("2026-11-20T12:00:00Z"), 1).getUTCDay()).toBe(1) // Fri → Mon
  })
  it("only allows legal transitions", () => {
    expect(canTransition("PAYMENT_PROCESSED", "RETURNED")).toBe(true)
    expect(canTransition("PAYMENT_SUBMITTED", "RETURNED")).toBe(false)
    expect(canTransition("PAYMENT_PROCESSED", "FAILED")).toBe(false)
    expect(canTransition("FAILED", "PAYMENT_PROCESSED")).toBe(false)
    expect(canTransition("PENDING_APPROVAL", "FUNDS_RECEIVED")).toBe(false)
  })
})

describe("ACH ledger", () => {
  const row = (p: Partial<AchPaymentRow>): AchPaymentRow =>
    ({ id: "p1", recipient_name: "Acme", usdc_amount_minor: "100500000", fee_usd_minor: "50", funded_onchain: false, return_code: null, status: "CREATED", ...p }) as AchPaymentRow
  const balances = (r: AchPaymentRow) => {
    const js = achJournalsFor(r)
    js.forEach((j) => expect(isBalanced(j.entries)).toBe(true))
    return accountBalances(js.flatMap((j) => j.entries.map((e) => ({ account: e.account, direction: e.direction, amount_minor: e.amountMinor.toString() }))))
  }
  it("MOCK_ONLY: a failure releases funds back to the Treasury", () => {
    const b = balances(row({ status: "FAILED", return_code: "R03" }))
    expect(b[ACH_ACCOUNTS.available]).toBe(0n)
    expect(b[ACH_ACCOUNTS.inTransit]).toBe(0n)
  })
  it("TESTNET_SETTLEMENT: a failure is a refund owed by the partner, not Treasury money", () => {
    const b = balances(row({ status: "FAILED", funded_onchain: true, return_code: "R03" }))
    expect(b[ACH_ACCOUNTS.available]).toBe(-100_500_000n)
    expect(b[ACH_ACCOUNTS.refundDue]).toBe(100_500_000n)
    expect(b[ACH_ACCOUNTS.partner]).toBe(0n)
  })
  it("settled then returned: delivered amount comes back, fee stays", () => {
    const b = balances(row({ status: "RETURNED", return_code: "R01" }))
    expect(b[ACH_ACCOUNTS.external]).toBe(0n)
    expect(b[ACH_ACCOUNTS.fees]).toBe(500_000n)
    expect(b[ACH_ACCOUNTS.available]).toBe(-500_000n)
  })
})

describe("webhook signature", () => {
  it("accepts a fresh valid signature and rejects tampering or replays", () => {
    const body = JSON.stringify({ event_id: "evt_1" })
    const now = 1_800_000_000
    const sig = signWebhook(body, "secret", now)
    expect(verifyWebhook(body, sig, "secret", now)).toBe(true)
    expect(verifyWebhook(body + " ", sig, "secret", now)).toBe(false)
    expect(verifyWebhook(body, sig, "other", now)).toBe(false)
    expect(verifyWebhook(body, sig, "secret", now + 3600)).toBe(false)
  })
})
