import { describe, expect, it } from "vitest"
import { signProposal, verifyProposal, type Proposal } from "@/lib/sancus/agent/proposals"

const KEY = "test-key"
const base = {
  kind: "ach" as const,
  title: "Pay Acme US$20 by ACH",
  lines: [{ label: "They receive", value: "US$20" }],
  request: { method: "POST" as const, path: "/api/sancus/payments", idempotent: true, body: { recipientId: "r1", usdAmount: "20.00" } },
  userId: "user-1",
}

describe("agent proposals", () => {
  it("verifies an untouched proposal for its owner", () => {
    const p = signProposal(base, Date.now(), KEY)
    expect(verifyProposal(p, "user-1", Date.now(), KEY)).toEqual({ ok: true })
  })

  it("rejects a changed amount, another person, or an expired proposal", () => {
    const p = signProposal(base, Date.now(), KEY)
    const tampered: Proposal = { ...p, request: { ...p.request, body: { ...p.request.body, usdAmount: "20000.00" } } }
    expect(verifyProposal(tampered, "user-1", Date.now(), KEY).ok).toBe(false)
    expect(verifyProposal(p, "user-2", Date.now(), KEY)).toMatchObject({ ok: false, status: 403 })
    expect(verifyProposal(p, "user-1", Date.now() + 11 * 60 * 1000, KEY)).toMatchObject({ ok: false, status: 410 })
  })

  it("only lets each kind call its own endpoint", () => {
    const p = signProposal({ ...base, request: { ...base.request, path: "/api/wallet/transfer" } }, Date.now(), KEY)
    expect(verifyProposal(p, "user-1", Date.now(), KEY)).toMatchObject({ ok: false, error: "That action isn't allowed" })
  })
})
