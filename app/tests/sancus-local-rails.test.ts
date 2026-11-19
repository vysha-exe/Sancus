import { describe, expect, it, vi } from "vitest"
import { chargeStatus, normaliseMidtrans, normaliseOmise, normalisePayzu, RAIL_INFO, strictRailConfigured } from "@/lib/sancus/local-sandboxes"
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

describe("strict sandbox readiness", () => {
  it("does not report Pix ready without a token and sandbox URL", () => {
    vi.stubEnv("PAYZU_SANDBOX_TOKEN", "")
    vi.stubEnv("PAYZU_BASE_URL", "https://pix.sandbox.payzu.dev/v1")
    expect(strictRailConfigured("PIX")).toBe(false)
    vi.unstubAllEnvs()
  })

  it("requires an Omise test key", () => {
    vi.stubEnv("OMISE_SECRET_KEY", "skey_live_not_allowed")
    expect(strictRailConfigured("PROMPTPAY")).toBe(false)
    vi.stubEnv("OMISE_SECRET_KEY", "skey_test_example")
    expect(strictRailConfigured("PROMPTPAY")).toBe(true)
    vi.unstubAllEnvs()
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
  id: "c1", user_id: "u1", company_id: "bangkok", receive_account_id: "bank", rail: "PROMPTPAY", currency: "THB", amount_minor: "50000", provider: "omise",
  provider_ref: "chrg_test", status: "PENDING", simulated: false, qr_image_url: null, qr_payload: null,
  simulator_url: null, destination_address: "0x000000000000000000000000000000000000dEaD", destination_label: "Treasury",
  token_address: "0x0", mint_tx: null, bank_credited_at: null, error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

describe("refreshCollection", () => {
  it("stays pending while the rail is pending (no bank credit)", async () => {
    const { client, db } = fakeDb(base)
    const credit = vi.fn()
    const out = await refreshCollection(client, base, { credit, status: async () => "PENDING" })
    expect(out.status).toBe("PENDING")
    expect(credit).not.toHaveBeenCalled()
    expect(db.row.status).toBe("PENDING")
  })
  it("credits the branch bank account exactly once when paid", async () => {
    const { client, db } = fakeDb(base)
    let deposits = 0
    const credit = vi.fn(async (_client, row: CollectionRow) => {
      if (db.row.status !== "PAID") return { ...db.row }
      deposits++
      db.row = { ...db.row, status: "CREDITED", bank_credited_at: new Date().toISOString() }
      return { ...row, ...db.row }
    })
    const out = await refreshCollection(client, base, { credit, status: async () => "PAID" })
    expect(out.status).toBe("CREDITED")
    await refreshCollection(client, { ...base, status: "PAID" }, { credit, status: async () => "PAID" })
    expect(deposits).toBe(1)
  })
  it("keeps it PAID with the error if the bank credit fails, so it retries", async () => {
    const { client, db } = fakeDb(base)
    const out = await refreshCollection(client, base, {
      credit: async () => { throw new Error("bank unavailable") },
      status: async () => "PAID",
    })
    expect(out.status).toBe("PAID")
    expect(db.row.status).toBe("PAID")
    expect(db.row.error).toContain("bank unavailable")
  })
})
