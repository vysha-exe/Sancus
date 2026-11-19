// Sancus: service-role Supabase client for server-side work that acts on someone else's rows
// (an admin approving an employee's payout, posting the requester's ledger journals, notifying
// approvers). Call it only after the route has checked the caller is allowed. Server only.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null = null

/** Null when the secret key isn't configured (mock / local UI mode). */
export function serviceClient(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim()
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return cached
}
