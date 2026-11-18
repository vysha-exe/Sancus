import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureTreasuryWallets, type ProvisionDeps, type WalletRow } from "@/lib/sancus/provision"

/** Tiny in-memory stand-in for the wallets table, with the one-per-type unique rule. */
function fakeSupabase(initial: WalletRow[] = [], opts: { conflictOn?: string } = {}) {
  const rows: (WalletRow & { user_id: string })[] = initial.map((r) => ({ ...r, user_id: "u1" }))
  const client = {
    from() {
      return {
        select() {
          const q = {
            eq: () => q,
            in: () => q,
            is: () => q,
            order: async () => ({
              data: rows.map((r) => ({ circle_wallet_id: r.circle_wallet_id, name: r.name, address: r.address, blockchain: r.blockchain, type: r.type })),
              error: null,
            }),
          }
          return q
        },
        async insert(row: WalletRow & { user_id: string }) {
          if (opts.conflictOn === row.type || rows.some((r) => r.type === row.type)) {
            return { error: { code: "23505", message: "duplicate" } }
          }
          rows.push(row)
          return { error: null }
        },
      }
    },
  }
  return { client: client as unknown as SupabaseClient, rows }
}

function fakeCircle(): ProvisionDeps & { calls: string[] } {
  let n = 0
  const calls: string[] = []
  return {
    calls,
    getWalletSetId: vi.fn(async () => "set-existing"),
    createWalletSet: vi.fn(async () => {
      calls.push("createWalletSet")
      return "set-new"
    }),
    createWallets: vi.fn(async (_set: string, count: number) => {
      calls.push(`createWallets:${count}`)
      return Array.from({ length: count }, () => ({ id: `w${++n}`, address: `0x${String(n).padStart(40, "0")}` }))
    }),
    afterCreate: vi.fn(async () => ["signer ok"]),
  }
}

describe("treasury provisioning on account creation", () => {
  it("creates Treasury + Settlement for a brand-new account", async () => {
    const db = fakeSupabase()
    const circle = fakeCircle()
    const r = await ensureTreasuryWallets(db.client, "u1", circle, true)
    expect(r.ok && r.created).toEqual(["Treasury", "Settlement"])
    expect(db.rows.map((w) => w.type)).toEqual(["treasury", "payout"])
    expect(circle.calls).toEqual(["createWalletSet", "createWallets:2"])
    expect(circle.afterCreate).toHaveBeenCalledOnce()
  })

  it("does nothing when both wallets already exist (safe to call on every visit)", async () => {
    const db = fakeSupabase([
      { circle_wallet_id: "a", name: "Treasury", address: "0x1", blockchain: "ARC-TESTNET", type: "treasury" },
      { circle_wallet_id: "b", name: "Settlement", address: "0x2", blockchain: "ARC-TESTNET", type: "payout" },
    ])
    const circle = fakeCircle()
    const r = await ensureTreasuryWallets(db.client, "u1", circle, true)
    expect(r.ok && r.created).toEqual([])
    expect(circle.calls).toEqual([])
  })

  it("only creates what's missing, reusing the existing wallet set", async () => {
    const db = fakeSupabase([{ circle_wallet_id: "a", name: "Treasury", address: "0x1", blockchain: "ARC-TESTNET", type: "treasury" }])
    const circle = fakeCircle()
    const r = await ensureTreasuryWallets(db.client, "u1", circle, true)
    expect(r.ok && r.created).toEqual(["Settlement"])
    expect(circle.calls).toEqual(["createWallets:1"])
    expect(circle.getWalletSetId).toHaveBeenCalledWith("a")
  })

  it("skips without touching Circle when Circle isn't configured", async () => {
    const circle = fakeCircle()
    const r = await ensureTreasuryWallets(fakeSupabase().client, "u1", circle, false)
    expect(r).toMatchObject({ ok: false, reason: "circle-not-configured" })
    expect(circle.calls).toEqual([])
  })

  it("keeps the first wallet when two requests race (unique rule)", async () => {
    const db = fakeSupabase([], { conflictOn: "treasury" })
    const r = await ensureTreasuryWallets(db.client, "u1", fakeCircle(), true)
    expect(r.ok && r.created).toEqual(["Settlement"])
    expect(r.ok && r.notes.join(" ")).toContain("another request")
  })

  it("reports Circle errors instead of throwing", async () => {
    const circle = fakeCircle()
    circle.createWallets = vi.fn(async () => {
      throw new Error("Circle 401")
    })
    const r = await ensureTreasuryWallets(fakeSupabase().client, "u1", circle, true)
    expect(r).toMatchObject({ ok: false, reason: "circle-error", message: "Circle 401" })
  })
})
