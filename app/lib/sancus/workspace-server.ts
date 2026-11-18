// Sancus: which company a request acts for (the workspace switcher's cookie / header). Server only.
import type { SupabaseClient } from "@supabase/supabase-js"
import { companyIdFromRequest } from "./workspace"

/** The selected company id, if the user can access it; otherwise null (personal). */
export async function workspaceCompany(req: Request, supabase: SupabaseClient, userId: string): Promise<string | null> {
  const id = companyIdFromRequest(req.headers, req.headers.get("cookie"))
  if (!id) return null
  const { data: allowed } = await supabase.rpc("sancus_can_access_company", { p_user: userId, p_company: id })
  return allowed ? id : null
}
