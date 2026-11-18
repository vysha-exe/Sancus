// Sancus: load the signed-in user's account and guard API routes by permission. Server only.
import { NextResponse } from "next/server"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import type { CompanyRow, MembershipRow } from "./companies"
import { resolveAccount, type Permission, type SancusAccount } from "./accounts"

export async function loadAccount(supabase: SupabaseClient, user: Pick<User, "id" | "email">): Promise<SancusAccount> {
  const [{ data: memberships }, { data: companies }] = await Promise.all([
    supabase.from("sancus_memberships").select("company_id, user_id, role, status").eq("user_id", user.id).eq("status", "ACTIVE"),
    // RLS returns only nodes this user can see (their nodes and everything under them).
    supabase.from("sancus_companies").select("id, parent_id, root_id, name, country"),
  ])
  return resolveAccount({
    userId: user.id,
    email: user.email ?? null,
    companies: (companies ?? []) as Pick<CompanyRow, "id" | "parent_id" | "root_id" | "name" | "country">[],
    memberships: (memberships ?? []) as Pick<MembershipRow, "company_id" | "user_id" | "role" | "status">[],
  })
}

const MESSAGES: Partial<Record<Permission, string>> = {
  "money.send": "Your account can't send money. Ask an admin to make this payment.",
  "approvals.decide": "Your account can't approve payments.",
  "branches.create": "Only the global account's admin can add branches.",
}

/** Returns a 403 response when the user lacks `permission`, else null. */
export async function requirePermission(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">,
  permission: Permission
): Promise<NextResponse | null> {
  const account = await loadAccount(supabase, user)
  if (account.can(permission)) return null
  return NextResponse.json(
    { error: MESSAGES[permission] ?? "Your account doesn't have access to this.", accountType: account.type, missing: permission },
    { status: 403 }
  )
}
