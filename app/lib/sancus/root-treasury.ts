import type { SupabaseClient, User } from "@supabase/supabase-js"
import { loadAccount } from "./accounts-server"

export type RootTreasuryContext = {
  companyId: string
  companyName: string
  userId: string
}

/** Resolve the one parent company this login is allowed to manage. */
export async function resolveRootTreasury(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<RootTreasuryContext | null> {
  const account = await loadAccount(supabase, user)
  if (account.type !== "ADMIN" || !account.can("treasury.manage")) return null
  const root = account.scopes.find((scope) => scope.isRoot && (scope.role === "OWNER" || scope.role === "ADMIN"))
  if (!root) return null
  return { companyId: root.companyId, companyName: root.companyName, userId: user.id }
}

export async function rootTreasuryWallet(
  supabase: SupabaseClient,
  root: RootTreasuryContext
) {
  const { data } = await supabase
    .from("wallets")
    .select("circle_wallet_id, address, blockchain, name, type, company_id")
    .eq("company_id", root.companyId)
    .eq("blockchain", "ARC-TESTNET")
    .eq("type", "treasury")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

export async function rootGatewaySigner(
  supabase: SupabaseClient,
  root: RootTreasuryContext
) {
  const { data } = await supabase
    .from("wallets")
    .select("circle_wallet_id, address, blockchain, name, type, company_id")
    .eq("company_id", root.companyId)
    .eq("blockchain", "ARC-TESTNET")
    .eq("type", "gateway_signer")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}
