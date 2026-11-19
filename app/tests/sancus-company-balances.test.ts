import { describe, expect, it } from "vitest"
import { applyCompanyBalances, type CompanyNode } from "@/lib/sancus/companies"

const can = { pay: true, approve: true, editPolicies: true, invite: true, createBranch: true, createWallet: true }

function node(id: string, children: CompanyNode[] = []): CompanyNode {
  return {
    id,
    parentId: id === "root" ? null : "root",
    rootId: "root",
    name: id,
    country: "",
    currency: "USD",
    depth: id === "root" ? 0 : 1,
    role: "ADMIN",
    roleInherited: id !== "root",
    can,
    wallets: [],
    ownMinor: "0",
    totalMinor: "0",
    children,
  }
}

describe("company balance projection", () => {
  it("hydrates every node and rolls branch balances into the parent", () => {
    const tree = [node("root", [node("jakarta"), node("bangkok")])]
    const wallets = [
      { walletId: "w1", name: "root", address: "0x1", blockchain: "ARC-TESTNET", companyId: "root", usdcMinor: "10000000", local: {} },
      { walletId: "w2", name: "jakarta", address: "0x2", blockchain: "ARC-TESTNET", companyId: "jakarta", usdcMinor: "6000000", local: { IDR: "9600000000" } },
      { walletId: "w3", name: "bangkok", address: "0x3", blockchain: "ARC-TESTNET", companyId: "bangkok", usdcMinor: "4000000", local: { THB: "14000000" } },
    ]

    const result = applyCompanyBalances(tree, { wallets, deductions: { jakarta: "1000000" } })

    expect(result[0]?.ownMinor).toBe("10000000")
    expect(result[0]?.totalMinor).toBe("19000000")
    expect(result[0]?.children[0]?.ownMinor).toBe("5000000")
    expect(result[0]?.children[1]?.ownMinor).toBe("4000000")
  })

  it("floors a branch at zero when pending commitments exceed its wallet balance", () => {
    const tree = [node("root", [node("bangkok")])]
    const wallets = [
      { walletId: "w1", name: "bangkok", address: "0x1", blockchain: "ARC-TESTNET", companyId: "bangkok", usdcMinor: "3000000", local: {} },
    ]

    const result = applyCompanyBalances(tree, { wallets, deductions: { bangkok: "337802231" } })

    expect(result[0]?.children[0]?.ownMinor).toBe("0")
    expect(result[0]?.children[0]?.totalMinor).toBe("0")
    expect(result[0]?.totalMinor).toBe("0")
  })
})
