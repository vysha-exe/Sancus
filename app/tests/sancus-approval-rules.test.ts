import { describe, expect, it } from "vitest"
import { resolveAccount } from "@/lib/sancus/accounts"
import { applyRoleApproval, checkApprover, checkDecision, EMPLOYEE_REQUEST_REASON, paymentMode } from "@/lib/sancus/approval-rules"

// Lion City Trading (root) → Thailand → Bangkok; Acme is someone else's company.
const companies = [
  { id: "root", parent_id: null, root_id: "root", name: "Lion City Trading", country: "SG" },
  { id: "th", parent_id: "root", root_id: "root", name: "Thailand", country: "TH" },
  { id: "bkk", parent_id: "th", root_id: "root", name: "Bangkok warehouse", country: "TH" },
  { id: "acme", parent_id: null, root_id: "acme", name: "Acme", country: "US" },
]
type Role = "OWNER" | "ADMIN" | "EMPLOYEE" | "FINANCE"
const m = (user_id: string, company_id: string, role: Role) => ({ user_id, company_id, role, status: "ACTIVE" })
const as = (userId: string, memberships: ReturnType<typeof m>[]) =>
  resolveAccount({ userId, email: `${userId}@x.co`, companies, memberships })

const maya = as("maya", [m("maya", "root", "OWNER")]) // admin
const sam = as("sam", [m("sam", "root", "ADMIN")]) // second admin
const ploy = as("ploy", [m("ploy", "th", "ADMIN")]) // branch admin
const niran = as("niran", [m("niran", "bkk", "EMPLOYEE")]) // employee
const alex = as("alex", []) // individual
const zoe = as("zoe", [m("zoe", "acme", "OWNER")]) // another company's admin
const wei = as("wei", [m("wei", "root", "FINANCE")]) // finance on the global account
const kit = as("kit", [m("kit", "th", "FINANCE")]) // finance on the Thailand branch only

describe("checkApprover: company payments", () => {
  it("lets an admin approve an employee's request", () => {
    expect(checkApprover(maya, { requesterId: "niran", companyId: "bkk" })).toEqual({ ok: true })
  })

  it("lets one admin approve another admin's payment", () => {
    expect(checkApprover(sam, { requesterId: "maya", companyId: "root" })).toEqual({ ok: true })
  })

  it("never lets anyone approve their own company payment", () => {
    const r = checkApprover(maya, { requesterId: "maya", companyId: "root" })
    expect(r).toMatchObject({ ok: false, code: "OWN_REQUEST" })
  })

  it("refuses admins of a different company", () => {
    expect(checkApprover(zoe, { requesterId: "niran", companyId: "bkk" })).toMatchObject({ ok: false, code: "NOT_YOURS" })
  })

  it("refuses accounts without the right to approve", () => {
    expect(checkApprover(niran, { requesterId: "maya", companyId: "root" })).toMatchObject({ ok: false, code: "NO_PERMISSION" })
    expect(checkApprover(ploy, { requesterId: "niran", companyId: "bkk" })).toMatchObject({ ok: false, code: "NO_PERMISSION" })
  })
})

describe("checkApprover: finance", () => {
  it("lets finance on the global account approve requests from any branch", () => {
    expect(checkApprover(wei, { requesterId: "niran", companyId: "bkk" })).toEqual({ ok: true })
    expect(checkApprover(wei, { requesterId: "maya", companyId: "root" })).toEqual({ ok: true })
  })

  it("limits branch finance to its own branch and below", () => {
    expect(checkApprover(kit, { requesterId: "niran", companyId: "bkk" })).toEqual({ ok: true })
    expect(checkApprover(kit, { requesterId: "maya", companyId: "root" })).toMatchObject({ ok: false, code: "NOT_YOURS" })
  })

  it("never lets finance approve their own request", () => {
    expect(checkApprover(wei, { requesterId: "wei", companyId: "root" })).toMatchObject({ ok: false, code: "OWN_REQUEST" })
  })

  it("gives finance approvals but not people management", () => {
    expect(wei.can("approvals.decide")).toBe(true)
    expect(wei.manageableCompanyIds()).toEqual([])
    expect(wei.canManageMembersAt("bkk")).toBe(false)
    expect(paymentMode(wei)).toBe("REQUEST")
  })
})

describe("checkApprover: personal payments", () => {
  it("lets a solo account approve its own payment", () => {
    expect(checkApprover(alex, { requesterId: "alex", companyId: null })).toEqual({ ok: true })
  })

  it("keeps everyone else out of a personal payment", () => {
    expect(checkApprover(maya, { requesterId: "alex", companyId: null })).toMatchObject({ ok: false, code: "NOT_YOURS" })
  })
})

describe("paymentMode", () => {
  it("admins and individuals send; employees only request; branch admins can't pay", () => {
    expect([maya, alex, niran, ploy].map(paymentMode)).toEqual(["SEND", "SEND", "REQUEST", null])
  })

  it("has a plain-English reason for requests", () => {
    expect(EMPLOYEE_REQUEST_REASON).toMatch(/admin/)
  })
})

describe("checkDecision: withdrawing your own request", () => {
  it("lets a branch admin withdraw their own transfer even without approval rights", () => {
    expect(checkDecision(ploy, { requesterId: "ploy", companyId: "th" }, "decline")).toEqual({ ok: true })
  })

  it("lets an employee withdraw their own request", () => {
    expect(checkDecision(niran, { requesterId: "niran", companyId: "bkk" }, "decline")).toEqual({ ok: true })
  })

  it("lets an admin withdraw their own payment but still not approve it", () => {
    expect(checkDecision(maya, { requesterId: "maya", companyId: "root" }, "decline")).toEqual({ ok: true })
    expect(checkDecision(maya, { requesterId: "maya", companyId: "root" }, "approve")).toMatchObject({ ok: false, code: "OWN_REQUEST" })
  })

  it("doesn't let a branch admin approve or decline someone else's payment", () => {
    expect(checkDecision(ploy, { requesterId: "niran", companyId: "bkk" }, "decline")).toMatchObject({ ok: false, code: "NO_PERMISSION" })
    expect(checkDecision(ploy, { requesterId: "niran", companyId: "bkk" }, "approve")).toMatchObject({ ok: false, code: "NO_PERMISSION" })
  })
})

describe("applyRoleApproval: the business admin skips approvals", () => {
  const allow = { decision: "ALLOW" as const, reason: null }
  const newPayee = { decision: "NEEDS_APPROVAL" as const, reason: "First payment to someone new needs an approver" }
  const overRule = { decision: "NEEDS_APPROVAL" as const, reason: "$1,200.00 is at or over the $1,000.00 approval rule" }
  const blocked = { decision: "BLOCK" as const, reason: "Over the $5,000.00 per-payment limit" }

  it("lets the business admin pay straight away: new payee or over the threshold", () => {
    expect(applyRoleApproval(maya, "root", newPayee)).toEqual(allow)
    expect(applyRoleApproval(maya, "root", overRule)).toEqual(allow)
    expect(applyRoleApproval(maya, "root", allow)).toEqual(allow)
  })

  it("leaves everyone else on the spending policy as before", () => {
    expect(applyRoleApproval(ploy, "th", allow)).toEqual(allow)
    expect(applyRoleApproval(ploy, "th", newPayee)).toEqual(newPayee)
    expect(applyRoleApproval(ploy, "th", overRule)).toEqual(overRule)
    expect(applyRoleApproval(niran, "bkk", overRule)).toEqual(overRule)
  })

  it("keeps hard limits for everyone, admin included", () => {
    expect(applyRoleApproval(maya, "root", blocked)).toEqual(blocked)
    expect(applyRoleApproval(ploy, "th", blocked)).toEqual(blocked)
  })

  it("leaves personal payments to the spending policy", () => {
    expect(applyRoleApproval(maya, null, newPayee)).toEqual(newPayee)
    expect(applyRoleApproval(alex, null, newPayee)).toEqual(newPayee)
  })
})
