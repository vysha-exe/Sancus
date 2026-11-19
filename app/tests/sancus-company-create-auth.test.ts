import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import { createCompanyForUser } from "@/lib/sancus/company-api"

function serviceClient(options: { membership: boolean }) {
  const companyInsert = vi.fn(async () => ({ error: null }))
  const membershipInsert = vi.fn(async () => ({ error: null }))
  const parent = { id: "11111111-1111-4111-8111-111111111111", parent_id: null, root_id: "11111111-1111-4111-8111-111111111111" }

  const client = {
    rpc: vi.fn(async () => ({ data: null, error: { message: "not authenticated" } })),
    from(table: string) {
      if (table === "sancus_companies") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: parent }),
          insert: companyInsert,
          delete: () => ({ eq: async () => ({ error: null }) }),
        }
        return builder
      }
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: async () => ({ data: options.membership ? { company_id: parent.id } : null }),
        insert: membershipInsert,
      }
      return builder
    },
  }

  return { client: client as unknown as SupabaseClient, companyInsert, membershipInsert }
}

describe("company creation with simple-admin auth", () => {
  it("creates a direct branch after rechecking the service-session actor's membership", async () => {
    const { client, companyInsert } = serviceClient({ membership: true })

    const result = await createCompanyForUser(client, "22222222-2222-4222-8222-222222222222", {
      parentId: "11111111-1111-4111-8111-111111111111",
      name: "United States",
      country: "US",
      currency: "USD",
    })

    expect(result.error).toBeNull()
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(companyInsert).toHaveBeenCalledWith(expect.objectContaining({
      parent_id: "11111111-1111-4111-8111-111111111111",
      name: "United States",
      created_by: "22222222-2222-4222-8222-222222222222",
    }))
  })

  it("does not use the service fallback without an Owner or Admin membership", async () => {
    const { client, companyInsert } = serviceClient({ membership: false })

    const result = await createCompanyForUser(client, "22222222-2222-4222-8222-222222222222", {
      parentId: "11111111-1111-4111-8111-111111111111",
      name: "United States",
      country: "US",
      currency: "USD",
    })

    expect(result).toEqual({ id: null, error: "Only the global account's Owner or Admin can add branches" })
    expect(companyInsert).not.toHaveBeenCalled()
  })
})
