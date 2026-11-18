// Sancus: shared server logic for the company / branch API routes.
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { countryByCode } from "./countries"
import type { CompanyRow } from "./companies"

export const nodeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  country: z.string().trim().length(2, "Pick a country"),
  currency: z.string().trim().length(3).optional(),
  /** Name for the first wallet created with the node. */
  walletName: z.string().trim().max(80).optional(),
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
