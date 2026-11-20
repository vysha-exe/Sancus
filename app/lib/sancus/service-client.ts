// Sancus: service-role Supabase client for server-side work that acts on someone else's rows
// (an admin approving an employee's payout, posting the requester's ledger journals, notifying
// approvers). Call it only after the route has checked the caller is allowed. Server only.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null
/** null = not probed yet; false = key rejected (e.g. Unregistered API key). */
let serviceKeyOk: boolean | null = null

function rawServiceClient(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return cached
}

/**
 * Null when the secret key isn't configured, or until {@link serviceOrUser} has
 * validated it. Sync callers should prefer `serviceOrUser` so a rejected key
 * never shadows the working user session.
 */
export function serviceClient(): SupabaseClient | null {
  if (serviceKeyOk !== true) return null
  return rawServiceClient()
}

/**
 * Prefer the service-role client when it works; otherwise the caller's user-scoped client.
 * A misconfigured / unregistered SUPABASE_SECRET_KEY must not break every read that
 * "opts into" the service client.
 */
export async function serviceOrUser(fallback: SupabaseClient): Promise<SupabaseClient> {
  if (serviceKeyOk === false) return fallback
  const service = rawServiceClient()
  if (!service) return fallback
  if (serviceKeyOk === true) return service

  const { error } = await service.from("sancus_companies").select("id").limit(1)
  if (error) {
    const msg = error.message || ""
    if (/unregistered|invalid api key|jwt/i.test(msg)) {
      console.warn("serviceOrUser: SUPABASE_SECRET_KEY rejected, using user session:", msg)
      serviceKeyOk = false
      cached = null
      return fallback
    }
    // Table/RLS errors still mean the key is accepted — use service for cross-row reads.
  }
  serviceKeyOk = true
  return service
}
