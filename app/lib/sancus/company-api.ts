// Sancus: shared server logic for the company / branch API routes.
import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { countryByCode } from "./countries"
import type { CompanyRow } from "./companies"

export const nodeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  country: z.string().trim().length(2, "Pick a country"),
  currency: z.string().trim().length(3).optional(),
})

export type NodeInput = z.infer<typeof nodeSchema>

export function resolveNodeInput(input: NodeInput): { ok: true; name: string; country: string; currency: string } | { ok: false; error: string } {
  const country = countryByCode(input.country)
  if (!country) return { ok: false, error: `Unsupported country ${input.country}` }
  return { ok: true, name: input.name, country: country.code, currency: (input.currency || country.currency).toUpperCase() }
}

export async function getCompany(supabase: SupabaseClient, id: string): Promise<CompanyRow | null> {
  const { data } = await supabase
    .from("sancus_companies")
    .select("id, parent_id, root_id, name, country, base_currency, created_at")
    .eq("id", id)
    .maybeSingle()
  return (data as CompanyRow | null) ?? null
}

type CreateCompanyInput = { parentId: string | null; name: string; country: string; currency: string }

/**
 * Creates through the user-scoped SQL RPC. Simple-login sessions use a
 * service-role client, whose auth.uid() is null, so that one known failure is
 * retried only after an explicit Owner/Admin check against the supplied actor.
 */
export async function createCompanyForUser(
  supabase: SupabaseClient,
  actorId: string,
  input: CreateCompanyInput
): Promise<{ id: string | null; error: string | null }> {
  const rpc = await supabase.rpc("sancus_create_company", {
    p_parent: input.parentId,
    p_name: input.name,
    p_country: input.country,
    p_currency: input.currency,
  })
  if (!rpc.error && rpc.data) return { id: String(rpc.data), error: null }
  if (!/not authenticated/i.test(rpc.error?.message ?? "")) {
    return { id: null, error: rpc.error?.message ?? "Could not create the company" }
  }

  // Service-role fallback for the signed simple-admin session. Never trust the
  // browser's role label: prove ownership again from membership rows.
  if (input.parentId) {
    const [{ data: parent }, { data: membership }] = await Promise.all([
      supabase.from("sancus_companies").select("id, parent_id, root_id").eq("id", input.parentId).maybeSingle(),
      supabase
        .from("sancus_memberships")
        .select("company_id")
        .eq("company_id", input.parentId)
        .eq("user_id", actorId)
        .eq("status", "ACTIVE")
        .in("role", ["OWNER", "ADMIN"])
        .maybeSingle(),
    ])
    if (!parent || parent.parent_id !== null) return { id: null, error: "Branches must be created directly under the parent treasury" }
    if (!membership) return { id: null, error: "Only the global account's Owner or Admin can add branches" }
  }

  const id = randomUUID()
  const { error: insertError } = await supabase.from("sancus_companies").insert({
    id,
    parent_id: input.parentId,
    root_id: input.parentId ?? id,
    name: input.name.trim(),
    country: input.country.toUpperCase(),
    base_currency: input.currency.toUpperCase(),
    created_by: actorId,
  })
  if (insertError) return { id: null, error: insertError.message }

  if (!input.parentId) {
    const { error: membershipError } = await supabase.from("sancus_memberships").insert({
      company_id: id,
      user_id: actorId,
      role: "OWNER",
      status: "ACTIVE",
    })
    if (membershipError) {
      // Roll back only the row created above so a failed membership cannot
      // leave an ownerless parent treasury behind.
      await supabase.from("sancus_companies").delete().eq("id", id)
      return { id: null, error: membershipError.message }
    }
  }

  return { id, error: null }
}

export function idFromPath(pathname: string, after: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  const i = parts.indexOf(after)
  const id = i >= 0 ? parts[i + 1] : undefined
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/** Turns a Postgres error from sancus_create_company into a friendly status + message. */
export function createError(message: string): { status: number; error: string } {
  if (/Owner or Admin|not authenticated/i.test(message)) return { status: 403, error: message }
  if (/levels deep|not found|check constraint/i.test(message)) return { status: 400, error: message }
  return { status: 500, error: "Could not create it" }
}
