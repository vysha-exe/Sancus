// Sancus: make sure an account has its Arc treasury wallets.
//
// Called automatically when an account is created (sign-up, email confirmation,
// demo login) and on first app visit, plus by the Settings "Set up treasury" button.
// Idempotent: only creates what's missing. A unique index (one treasury + one
// settlement wallet per account per chain) protects against two calls racing.
//
//   Treasury   (type "treasury")  developer-controlled SCA wallet: holds USDC, pays out, receives x402
//   Settlement (type "payout")    developer-controlled SCA wallet: stands in for the payout partner
// Plus, best effort: Gateway signer wallets, the Treasury's Gateway delegate, webhook registration.

import type { SupabaseClient } from "@supabase/supabase-js"

export const TREASURY_CHAIN = "ARC-TESTNET"
export const TREASURY_ROLES = [
  { type: "treasury", name: "Treasury" },
  { type: "payout", name: "Settlement" },
] as const

export type WalletRow = { circle_wallet_id: string; name: string; address: string; blockchain: string; type: string }

/** The Circle calls provisioning needs (injectable so it can be tested without Circle). */
export type ProvisionDeps = {
  getWalletSetId(walletId: string): Promise<string | undefined>
  createWalletSet(name: string): Promise<string | undefined>
  createWallets(walletSetId: string, count: number): Promise<{ id: string; address: string }[]>
  /** Best effort; failures become notes. */
  afterCreate?(userId: string, rows: { circle_wallet_id: string; address: string; type: string }[]): Promise<string[]>
}

export type ProvisionResult =
  | { ok: true; created: string[]; notes: string[]; wallets: WalletRow[] }
  | { ok: false; reason: "circle-not-configured" | "circle-error"; message: string; wallets: WalletRow[] }

export function circleConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CIRCLE_API_KEY?.trim() && env.CIRCLE_ENTITY_SECRET?.trim())
}

export async function listTreasuryWallets(supabase: SupabaseClient, userId: string): Promise<WalletRow[]> {
  const { data } = await supabase
    .from("wallets")
    .select("circle_wallet_id, name, address, blockchain, type")
    .eq("user_id", userId)
    .eq("blockchain", TREASURY_CHAIN)
    .in("type", ["treasury", "payout"])
    .is("company_id", null) // personal wallets only; branch wallets belong to a company node
    .order("created_at", { ascending: true })
  return (data ?? []) as WalletRow[]
}

export async function ensureTreasuryWallets(
  supabase: SupabaseClient,
  userId: string,
  deps: ProvisionDeps,
  configured: boolean = circleConfigured()
): Promise<ProvisionResult> {
  const existing = await listTreasuryWallets(supabase, userId)
  const missing = TREASURY_ROLES.filter((r) => !existing.some((w) => w.type === r.type))
  if (missing.length === 0) return { ok: true, created: [], notes: [], wallets: existing }
  if (!configured) {
    return { ok: false, reason: "circle-not-configured", message: "Circle API key / entity secret not set", wallets: existing }
  }

  try {
    let walletSetId = existing[0] ? await deps.getWalletSetId(existing[0].circle_wallet_id) : undefined
    walletSetId ??= await deps.createWalletSet(`Sancus treasury ${userId.slice(0, 8)}`)
    if (!walletSetId) throw new Error("Circle did not return a wallet set id")

    const created = await deps.createWallets(walletSetId, missing.length)
    if (created.length < missing.length) throw new Error("Circle returned fewer wallets than requested")

    const rows = missing.map((role, i) => ({
      user_id: userId,
      name: role.name,
      circle_wallet_id: created[i]!.id,
      address: created[i]!.address,
      blockchain: TREASURY_CHAIN,
      type: role.type,
    }))

    const notes: string[] = []
    const inserted: typeof rows = []
    for (const row of rows) {
      const { error } = await supabase.from("wallets").insert(row)
      if (!error) inserted.push(row)
      else if (error.code === "23505") notes.push(`${row.name} was created by another request at the same time; kept that one`)
      else throw new Error(`Saving ${row.name} failed: ${error.message}`)
    }

    if (inserted.length && deps.afterCreate) {
      try {
        notes.push(...(await deps.afterCreate(userId, inserted)))
      } catch (e) {
        notes.push(`Post-setup step skipped: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return { ok: true, created: inserted.map((r) => r.name), notes, wallets: await listTreasuryWallets(supabase, userId) }
  } catch (e) {
    return {
      ok: false,
      reason: "circle-error",
      message: e instanceof Error ? e.message : String(e),
      wallets: await listTreasuryWallets(supabase, userId),
    }
  }
}
