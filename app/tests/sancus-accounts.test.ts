import { describe, expect, it } from "vitest"
import { canOpenPath } from "@/lib/sancus/use-account"
import { accountFromDto, AdminAccount, BranchAccount, EmployeeAccount, IndividualAccount, resolveAccount } from "@/lib/sancus/accounts"

// Lion City Trading (root) → Thailand → Bangkok warehouse; Indonesia is a sibling branch.
const companies = [
  { id: "root", parent_id: null, root_id: "root", name: "Lion City Trading", country: "SG" },
  { id: "th", parent_id: "root", root_id: "root", name: "Thailand", country: "TH" },
  { id: "bkk", parent_id: "th", root_id: "root", name: "Bangkok warehouse", country: "TH" },
  { id: "id", parent_id: "root", root_id: "root", name: "Indonesia", country: "ID" },
]
const m = (user_id: string, company_id: string, role: "OWNER" | "ADMIN" | "EMPLOYEE" | "FINANCE", status = "ACTIVE") => ({ user_id, company_id, role, status })
const as = (userId: string, memberships: ReturnType<typeof m>[]) => resolveAccount({ userId, email: `${userId}@x.co`, companies, memberships })

describe("resolveAccount", () => {
  it("picks the type from the user's own active memberships", () => {
    expect(as("maya", [m("maya", "root", "OWNER")])).toBeInstanceOf(AdminAccount)
    expect(as("ploy", [m("ploy", "th", "ADMIN")])).toBeInstanceOf(BranchAccount)
    expect(as("niran", [m("niran", "bkk", "EMPLOYEE")])).toBeInstanceOf(EmployeeAccount)
    expect(as("alex", [])).toBeInstanceOf(IndividualAccount)
  })
  it("ignores other people's and disabled memberships; the most powerful role wins", () => {
    expect(as("alex", [m("maya", "root", "OWNER")])).toBeInstanceOf(IndividualAccount)
    expect(as("niran", [m("niran", "th", "ADMIN", "DISABLED")])).toBeInstanceOf(IndividualAccount)
    expect(as("ploy", [m("ploy", "bkk", "EMPLOYEE"), m("ploy", "th", "ADMIN")])).toBeInstanceOf(BranchAccount)
  })
})

describe("permissions", () => {
  const admin = as("maya", [m("maya", "root", "OWNER")])
  const branch = as("ploy", [m("ploy", "th", "ADMIN")])
  const employee = as("niran", [m("niran", "bkk", "EMPLOYEE")])
  const individual = as("alex", [])

  it("only admins and individuals can send money; employees never", () => {
    expect([admin, branch, employee, individual].map((a) => a.can("money.send"))).toEqual([true, false, false, true])
    expect(employee.can("card.view") && employee.can("limits.view") && employee.can("agent.use")).toBe(true)
  })

  it("admin manages the whole company; branch admin only its own subtree", () => {
    expect(admin.manageableCompanyIds().sort()).toEqual(["bkk", "id", "root", "th"])
    expect(branch.manageableCompanyIds().sort()).toEqual(["bkk", "th"])
    expect(branch.canManageMembersAt("id")).toBe(false) // another branch
    expect(branch.canManageMembersAt("root")).toBe(false) // the global account
    expect(employee.manageableCompanyIds()).toEqual([])
  })

  it("branch logins go on branches and only the admin creates them", () => {
    expect(admin.canCreateAccount("BRANCH", "th")).toBe(true)
    expect(admin.canCreateAccount("BRANCH", "root")).toBe(false)
    expect(branch.canCreateAccount("BRANCH", "bkk")).toBe(false)
    expect(branch.canCreateAccount("EMPLOYEE", "bkk")).toBe(true)
    expect(branch.canCreateAccount("EMPLOYEE", "id")).toBe(false)
    expect(employee.canCreateAccount("EMPLOYEE", "bkk")).toBe(false)
  })

  it("routes each type to its own dashboard and keeps it out of the rest", () => {
    expect([admin, branch, employee, individual].map((a) => a.homePath)).toEqual(["/home", "/branch", "/me", "/home"])
    // Employees reach Pay from Me to request a payment (it isn't in their side navigation).
    expect(employee.canAccessPath("/pay")).toBe(true)
    expect(employee.nav).not.toContain("pay")
    expect(employee.canAccessPath("/me")).toBe(true)
    expect(employee.canAccessPath("/notifications")).toBe(true)
    expect(branch.canAccessPath("/pay/us-bank")).toBe(false)
    expect(branch.canAccessPath("/team")).toBe(true)
    expect(individual.canAccessPath("/team")).toBe(false)
    expect(admin.canAccessPath("/agents")).toBe(true)
    expect(admin.canAccessPath("/treasury")).toBe(true)
    expect(admin.can("treasury.manage")).toBe(true)
    expect(branch.canAccessPath("/treasury")).toBe(false)
    expect(individual.canAccessPath("/treasury")).toBe(false)
    expect(admin.canAccessPath("/dev")).toBe(true)
    expect(admin.canAccessPath("/process")).toBe(true)
    expect(admin.toJSON().nav).toEqual(expect.arrayContaining(["dev", "devqa"]))
  })

  it("survives the trip to the browser", () => {
    const dto = JSON.parse(JSON.stringify(branch.toJSON()))
    const back = accountFromDto(dto, companies)
    expect(back).toBeInstanceOf(BranchAccount)
    expect(back.manageableCompanyIds().sort()).toEqual(["bkk", "th"])
    expect(dto.manageableCompanyIds.sort()).toEqual(["bkk", "th"])
  })
})

describe("canOpenPath (browser) matches canAccessPath (server)", () => {
  const accounts = [
    as("maya", [m("maya", "root", "OWNER")]),
    as("ploy", [m("ploy", "th", "ADMIN")]),
    as("niran", [m("niran", "bkk", "EMPLOYEE")]),
    as("wei", [m("wei", "root", "FINANCE")]),
    as("alex", []),
  ]
  const paths = ["/home", "/branch", "/me", "/pay", "/pay/review", "/receive", "/activity", "/activity/approvals", "/spending",
    "/branches", "/team", "/invoices", "/agents", "/treasury", "/dev", "/process", "/settings", "/notifications"]
  it.each(accounts.map((a) => [a.label, a] as const))("%s", (_label, account) => {
    const dto = account.toJSON()
    for (const p of paths) expect([p, canOpenPath(dto, p)]).toEqual([p, account.canAccessPath(p)])
  })
})
