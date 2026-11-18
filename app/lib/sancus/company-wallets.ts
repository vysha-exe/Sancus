// Sancus: Circle wallets for company nodes (global account, branches, sub-branches). Server only.
// Each global account gets one Circle wallet set; every node's wallets live in it.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Address } from "viem"
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client"
import { getUsdcBalance } from "@/lib/circle/gateway-sdk"
import { syncGatewayWebhookSubscription } from "@/lib/circle/gateway-webhooks"
import { circleConfigured, TREASURY_CHAIN } from "./provision"
import type { CompanyRow, CompanyWallet } from "./companies"

type WalletDbRow = { circle_wallet_id: string; name: string; address: string; blockchain: string; company_id: string }

export async function listCompanyWallets(supabase: SupabaseClient, companyIds: string[]): Promise<WalletDbRow[]> {
  if (companyIds.length === 0) return []
  const { data } = await supabase
    .from("wallets")
    .select("circle_wallet_id, name, address, blockchain, company_id")
    .in("company_id", companyIds)
    .order("created_at", { ascending: true })
  return (data ?? []) as WalletDbRow[]
}

/** Live USDC balances (public RPC, no Circle key needed). Unreadable → null. */
export async function withBalances(rows: WalletDbRow[]): Promise<CompanyWallet[]> {
  const out: CompanyWallet[] = []
  for (const r of rows) {
    let usdcMinor: string | null = null
    try {
      const bal = await Promise.race([
        getUsdcBalance(r.address as Address, "arcTestnet"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 6000)),
      ])
      usdcMinor = bal.toString()
    } catch {
      /* leave null */
    }
    out.push({ walletId: r.circle_wallet_id, name: r.name, address: r.address, blockchain: r.blockchain, companyId: r.company_id, usdcMinor })
  }
  return out
}

export type CreateWalletResult = { ok: true; wallet: WalletDbRow } | { ok: false; status: number; error: string }

/**
 * Creates a developer-controlled SCA wallet on Arc testnet for a company node and saves it.
 * Reuses the global account's wallet set (found via any wallet already in the same tree).
 */
export async function createCompanyWallet(
  supabase: SupabaseClient,
  userId: string,
  company: CompanyRow,
  name: string
): Promise<CreateWalletResult> {
  if (!circleConfigured()) {
    return { ok: false, status: 503, error: "Circle isn't set up (CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET)" }
  }
  try {
    // Wallet set: reuse one from any node in this global account, else create it.
    const { data: tree } = await supabase.from("sancus_companies").select("id, name, parent_id").eq("root_id", company.root_id)
    const treeIds = (tree ?? []).map((c) => c.id as string)
    const existing = await listCompanyWallets(supabase, treeIds)
    let walletSetId: string | undefined
    if (existing[0]) {
      const ref = await circleDeveloperSdk.getWallet({ id: existing[0].circle_wallet_id })
      walletSetId = ref.data?.wallet?.walletSetId
    }
    if (!walletSetId) {
      const rootName = (tree ?? []).find((c) => !c.parent_id)?.name ?? company.name
      const set = await circleDeveloperSdk.createWalletSet({ name: `Sancus ${rootName}`.slice(0, 64) })
      walletSetId = set.data?.walletSet?.id
    }
    if (!walletSetId) throw new Error("Circle did not return a wallet set id")

    const res = await circleDeveloperSdk.createWallets({
      walletSetId,
      blockchains: [TREASURY_CHAIN],
      count: 1,
      accountType: "SCA",
    })
    const w = res.data?.wallets?.[0]
    if (!w) throw new Error("Circle did not return a wallet")

    const row = {
      user_id: userId,
      name: name.trim().slice(0, 80),
      circle_wallet_id: w.id,
      address: w.address,
      blockchain: TREASURY_CHAIN,
      type: "treasury",
      company_id: company.id,
    }
    const { error } = await supabase.from("wallets").insert(row)
    if (error) {
      return { ok: false, status: error.code === "42501" ? 403 : 500, error: `Saving the wallet failed: ${error.message}` }
    }
    try {
      await syncGatewayWebhookSubscription([w.address])
    } catch {
      /* best effort */
    }
    return { ok: true, wallet: { circle_wallet_id: w.id, name: row.name, address: w.address, blockchain: TREASURY_CHAIN, company_id: company.id } }
  } catch (e) {
    return { ok: false, status: 502, error: `Circle wallet creation failed: ${e instanceof Error ? e.message : String(e)}` }
  }
}
