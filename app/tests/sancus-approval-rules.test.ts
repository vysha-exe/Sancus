import { describe, expect, it } from "vitest"
import { resolveAccount } from "@/lib/sancus/accounts"
import { checkApprover, EMPLOYEE_REQUEST_REASON, paymentMode } from "@/lib/sancus/approval-rules"

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
