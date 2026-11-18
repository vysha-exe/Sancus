import { describe, expect, it, vi } from "vitest"
import { chargeStatus, normaliseMidtrans, normaliseOmise, normalisePayzu, RAIL_INFO } from "@/lib/sancus/local-sandboxes"
import { refreshCollection, type CollectionRow } from "@/lib/sancus/rail-collections"
import { MOCK_TOKENS } from "@/lib/sancus/mock-tokens"

describe("rail status mapping", () => {
  it("maps Midtrans, Omise and PayZu statuses", () => {
    expect(normaliseMidtrans("settlement")).toBe("PAID")
    expect(normaliseMidtrans("pending")).toBe("PENDING")
    expect(normaliseMidtrans("expire")).toBe("EXPIRED")
    expect(normaliseOmise("successful")).toBe("PAID")
    expect(normaliseOmise("failed")).toBe("FAILED")
    expect(normalisePayzu("completed")).toBe("PAID")
    expect(normalisePayzu("CANCELLED")).toBe("FAILED")
  })
  it("simulated Pix pays itself after the delay", async () => {
    const t0 = new Date("2026-11-18T00:00:00Z")
    expect(await chargeStatus("simulated", "x", t0, new Date(t0.getTime() + 3000))).toBe("PENDING")
    expect(await chargeStatus("simulated", "x", t0, new Date(t0.getTime() + 11000))).toBe("PAID")
  })
  it("each rail maps to a deployed mock token", () => {
    for (const r of Object.values(RAIL_INFO)) expect(MOCK_TOKENS[r.currency].address).toMatch(/^0x[0-9a-fA-F]{40}$/)
  })
})

// Minimal in-memory stand-in for the supabase update().eq().eq().select().maybeSingle() chain.
function fakeDb(row: CollectionRow) {
  const db = { row: { ...row } }
  const client = {
    from: () => ({
      update: (patch: Partial<CollectionRow>) => {
        const conds: [string, unknown][] = []
        const chain = {
          eq: (k: string, v: unknown) => (conds.push([k, v]), chain),
          select: () => chain,
          maybeSingle: async () => {
            const ok = conds.every(([k, v]) => (db.row as Record<string, unknown>)[k] === v)
            if (ok) db.row = { ...db.row, ...patch }
            return { data: ok ? { ...db.row } : null }
          },
          then: (res: (v: unknown) => void) => chain.maybeSingle().then(res),
        }
        return chain
      },
    }),
  }
  return { db, client: client as never }
}

const base: CollectionRow = {
  id: "c1", user_id: "u1", rail: "PROMPTPAY", currency: "THB", amount_minor: "50000", provider: "omise",
  provider_ref: "chrg_test", status: "PENDING", simulated: false, qr_image_url: null, qr_payload: null,
  simulator_url: null, destination_address: "0x000000000000000000000000000000000000dEaD", destination_label: "Treasury",
  token_address: "0x0", mint_tx: null, error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

describe("refreshCollection", () => {
  it("stays pending while the rail is pending (no mint)", async () => {
    const { client, db } = fakeDb(base)
    const mint = vi.fn()
    const out = await refreshCollection(client, base, { mint, status: async () => "PENDING" })
    expect(out.status).toBe("PENDING")
    expect(mint).not.toHaveBeenCalled()
    expect(db.row.status).toBe("PENDING")
  })
  it("mints exactly once when paid, with the right token, amount and ref", async () => {
    const { client, db } = fakeDb(base)
    const mint = vi.fn(async () => "0xabc" as const)
    const out = await refreshCollection(client, base, { mint, status: async () => "PAID" })
    expect(out.status).toBe("MINTED")
    expect(db.row.mint_tx).toBe("0xabc")
    expect(mint).toHaveBeenCalledWith("THB", base.destination_address, 50000n, "sancus:PROMPTPAY:chrg_test")
    // A second (or concurrent) refresh of the stale row must not mint again.
    await refreshCollection(client, { ...base, status: "PAID" }, { mint, status: async () => "PAID" })
    expect(mint).toHaveBeenCalledTimes(1)
  })
  it("puts it back to PAID with the error if the mint fails, so it retries", async () => {
    const { client, db } = fakeDb(base)
    const out = await refreshCollection(client, base, {
      mint: async () => { throw new Error("out of gas") },
      status: async () => "PAID",
    })
    expect(out.status).toBe("PAID")
    expect(db.row.status).toBe("PAID")
    expect(db.row.error).toContain("out of gas")
  })
})
