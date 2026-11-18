import { describe, expect, it } from "vitest"
import {
  buildCompanyTree,
  capabilities,
  countNodes,
  effectiveRole,
  findNode,
  type CompanyRow,
  type CompanyWallet,
  type MembershipRow,
} from "@/lib/sancus/companies"

// Global account (SG HQ) → Indonesia branch → Jakarta sub-branch; Thailand branch.
const t = (n: number) => `2026-11-18T00:00:0${n}Z`
const companies: CompanyRow[] = [
  { id: "root", parent_id: null, root_id: "root", name: "Lion City Trading", country: "SG", base_currency: "SGD", created_at: t(0) },
  { id: "id", parent_id: "root", root_id: "root", name: "Indonesia", country: "ID", base_currency: "IDR", created_at: t(1) },
  { id: "jkt", parent_id: "id", root_id: "root", name: "Jakarta", country: "ID", base_currency: "IDR", created_at: t(2) },
  { id: "th", parent_id: "root", root_id: "root", name: "Thailand", country: "TH", base_currency: "THB", created_at: t(3) },
]
const memberships: MembershipRow[] = [
  { company_id: "root", user_id: "maya", role: "OWNER", status: "ACTIVE" },
  { company_id: "jkt", user_id: "rafael", role: "FINANCE", status: "ACTIVE" },
  { company_id: "id", user_id: "ana", role: "ADMIN", status: "ACTIVE" },
  { company_id: "th", user_id: "ana", role: "VIEWER", status: "DISABLED" },
]
const w = (companyId: string, usdc: string | null, name = "Treasury"): CompanyWallet => ({
  walletId: `${companyId}-${name}`,
  name,
  address: "0x0",
  blockchain: "ARC-TESTNET",
  companyId,
  usdcMinor: usdc,
})
const wallets = [w("root", "10000000000"), w("id", "2000000000"), w("jkt", "500000000"), w("jkt", "250000000", "Payroll"), w("th", null)]

describe("company tree", () => {
  it("nests branches and sub-branches under the global account", () => {
    const tree = buildCompanyTree(companies, memberships, wallets, "maya")
    expect(tree).toHaveLength(1)
    expect(tree[0]!.children.map((c) => c.name)).toEqual(["Indonesia", "Thailand"])
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("Jakarta")
    expect(countNodes(tree)).toBe(4)
    expect(findNode(tree, "jkt")?.depth).toBe(2)
  })

  it("lets a sub-branch hold several wallets and rolls balances up the tree", () => {
    const tree = buildCompanyTree(companies, memberships, wallets, "maya")
    const jkt = findNode(tree, "jkt")!
    expect(jkt.wallets.map((x) => x.name)).toEqual(["Treasury", "Payroll"])
    expect(jkt.ownMinor).toBe("750000000")
    expect(findNode(tree, "id")!.totalMinor).toBe("2750000000") // Indonesia + Jakarta
    expect(tree[0]!.totalMinor).toBe("12750000000") // everything; unreadable Thailand counts as 0
  })
})

describe("roles inherit down, never up", () => {
  it("an Owner of the global account is Owner (inherited) on every branch", () => {
    expect(effectiveRole(companies, memberships, "maya", "jkt")).toEqual({ role: "OWNER", inherited: true })
    expect(effectiveRole(companies, memberships, "maya", "root")).toEqual({ role: "OWNER", inherited: false })
  })

  it("a sub-branch member has no rights on the branch or global account above", () => {
    expect(effectiveRole(companies, memberships, "rafael", "jkt").role).toBe("FINANCE")
    expect(effectiveRole(companies, memberships, "rafael", "id").role).toBeNull()
    expect(effectiveRole(companies, memberships, "rafael", "root").role).toBeNull()
  })

  it("ignores disabled memberships and doesn't leak to sibling branches", () => {
    expect(effectiveRole(companies, memberships, "ana", "th").role).toBeNull()
    expect(effectiveRole(companies, memberships, "ana", "jkt")).toEqual({ role: "ADMIN", inherited: true })
  })

  it("a user sees only the subtrees they belong to", () => {
    const visible = companies.filter((c) => ["jkt"].includes(c.id))
    const tree = buildCompanyTree(visible, memberships, wallets, "rafael")
    expect(tree.map((n) => n.name)).toEqual(["Jakarta"]) // shown as its own root
  })
})

describe("capabilities", () => {
  it("only Owners and Admins can add branches and wallets", () => {
    expect(capabilities("OWNER").createBranch).toBe(true)
    expect(capabilities("ADMIN").createWallet).toBe(true)
    expect(capabilities("FINANCE")).toMatchObject({ pay: true, approve: true, createBranch: false, createWallet: false })
    expect(capabilities("EMPLOYEE")).toMatchObject({ pay: true, approve: false })
    expect(capabilities("VIEWER")).toMatchObject({ pay: false, createBranch: false })
    expect(capabilities(null).pay).toBe(false)
  })
})
