import { describe, expect, it } from "vitest"
import { calculateCompanyTotal, localBankMinorToReportingMinor } from "@/lib/sancus/company-total"
import type { CompanyNode } from "@/lib/sancus/companies"

const can = { pay: true, approve: true, editPolicies: true, invite: true, createBranch: true, createWallet: true }

function company(
  id: string,
  currency: string,
  bankMinor: string,
  walletMinor: string,
  children: CompanyNode[] = [],
): CompanyNode {
  return {
    id,
    parentId: id === "root" ? null : "root",
    rootId: "root",
    name: id,
    country: "",
    currency,
    depth: id === "root" ? 0 : 1,
    role: "ADMIN",
    roleInherited: id !== "root",
    can,
    wallets: walletMinor === "0" ? [] : [{ walletId: `${id}-wallet`, name: id, address: id, blockchain: "ARC-TESTNET", companyId: id, usdcMinor: walletMinor }],
    ownMinor: walletMinor,
    totalMinor: (BigInt(walletMinor) + children.reduce((sum, child) => sum + BigInt(child.totalMinor), 0n)).toString(),
    bankBalance: { currency, balanceMinor: bankMinor, postedMinor: bankMinor, heldMinor: "0", bankName: `${id} bank` },
    children,
  }
}

describe("company-wide total", () => {
  it("converts branch banks to the parent currency and counts each own wallet once", () => {
    const brazil = company("brazil", "BRL", "54123", "1000000")
    const root = company("root", "SGD", "100", "2000000", [brazil])
    const total = calculateCompanyTotal(root)

    // S$1 parent bank + R$541.23 (US$100) + US$3 of wallet liquidity.
    expect(total.bankMinor).toBe("134590000")
    expect(total.walletMinor).toBe("4007700")
    expect(total.totalMinor).toBe("138597700")
    expect(total.bankAccounts).toBe(2)
    expect(total.wallets).toBe(2)
  })

  it("adds parent Treasury positions once", () => {
    const root = company("root", "USD", "0", "10000000")
    const total = calculateCompanyTotal(root, {
      fUsdcMinor: "20000000",
      equities: [{ valueMinor: "5000000" }],
      yield: [{ valueMinor: "2000000" }],
    })

    expect(total.walletMinor).toBe("10000000")
    expect(total.positionsMinor).toBe("27000000")
    expect(total.totalMinor).toBe("37000000")
  })

  it("converts same-currency bank cents without floating-point loss", () => {
    expect(localBankMinorToReportingMinor("100000000", "IDR", "IDR")).toBe(1_000_000_000_000n)
  })
})
