import { afterEach, describe, expect, it, vi } from "vitest"
import { loadCompanies, loadCompanyBalances, resetCompaniesCache } from "@/lib/sancus/use-companies"

const response = {
  tree: [{
    id: "root",
    parentId: null,
    rootId: "root",
    name: "Treasury",
    country: "",
    currency: "USD",
    depth: 0,
    role: "ADMIN",
    roleInherited: false,
    can: { pay: true, approve: true, editPolicies: true, invite: true, createBranch: true, createWallet: true },
    wallets: [],
    ownMinor: "0",
    totalMinor: "0",
    children: [],
  }],
  nodeCount: 1,
  walletCount: 1,
  circleConfigured: true,
}

const balances = {
  wallets: [{
    walletId: "wallet-1",
    name: "Treasury",
    address: "0x0000000000000000000000000000000000000001",
    blockchain: "ARC-TESTNET",
    companyId: "root",
    usdcMinor: "18000000",
    local: {},
  }],
  deductions: {},
}

describe("company workspace cache", () => {
  afterEach(() => {
    resetCompaniesCache()
    vi.unstubAllGlobals()
  })

  it("reuses a fresh workspace snapshot across route mounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal("fetch", fetchMock)

    await loadCompanies(false, 1_000)
    await loadCompanies(false, 1_001)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refetches when a mutation explicitly refreshes the workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal("fetch", fetchMock)

    await loadCompanies(false, 1_000)
    await loadCompanies(true, 1_001)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("publishes structure before loading balances in a separate request", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return { ok: true, json: async () => url.includes("/balances") ? balances : response }
    })
    vi.stubGlobal("fetch", fetchMock)

    const structure = await loadCompanies(false, 1_000)
    expect(structure?.tree[0]?.ownMinor).toBe("0")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const hydrated = await loadCompanyBalances(false, 1_001)
    expect(hydrated?.tree[0]?.ownMinor).toBe("18000000")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("reuses a fresh balance snapshot across route mounts", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => ({
      ok: true,
      json: async () => String(input).includes("/balances") ? balances : response,
    }))
    vi.stubGlobal("fetch", fetchMock)

    await loadCompanies(false, 1_000)
    await loadCompanyBalances(false, 1_001)
    await loadCompanyBalances(false, 1_002)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
