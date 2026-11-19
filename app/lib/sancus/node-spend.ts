// Sancus: what each company node has committed or paid out on simulated legs, so every view
// (dashboard, branch tree, workspace switcher, branch page) shows the same balance per node.
// Real USDC transfers are already reflected onchain and aren't counted here. Server only.
import type { SupabaseClient } from "@supabase/supabase-js"
import { getLiveRates, toRateMicro } from "./live-fx"
import { BALANCE_SINCE, simulatedSpend, type SimSpendInputs } from "./treasury"
import { isTerminal, type PayoutStatus } from "./payout-provider"
import { serviceClient } from "./service-client"
import { loadRootTransferPositions } from "./transfer-positions"

/**
 * companyId → USDC minor units to take off that node's onchain balance (payments in progress).
 * Negative for HQ when internal transfers brought in more than they sent out (see transfer-positions).
 */
export async function loadNodeDeductions(supabase: SupabaseClient, companyIds: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>()
  if (!companyIds.length) return out
  const { data: nodes } = await supabase.from("sancus_companies").select("id, parent_id").in("id", companyIds)
  const rootIds = (nodes ?? []).filter((node) => node.parent_id === null).map((node) => node.id as string)
  // Service client: a transfer's other end may be a branch this user can't read through RLS.
  const positions = await loadRootTransferPositions(serviceClient() ?? supabase, rootIds)
  const [payouts, ach, pix, live] = await Promise.all([
    supabase.from("sancus_payouts").select("company_id, status, usdc_amount_minor, tx_hash, simulated, created_at").in("company_id", companyIds),
    supabase.from("sancus_ach_payments").select("company_id, status, usdc_amount_minor, funded_onchain, created_at").in("company_id", companyIds).gte("created_at", BALANCE_SINCE),
    supabase.from("sancus_pix_payments").select("company_id, status, amount_brl_minor, created_at").in("company_id", companyIds).gte("created_at", BALANCE_SINCE),
    getLiveRates(),
  ])
  const brlRateMicro = toRateMicro(live.rates.BRL ?? 5.4123)
  for (const id of companyIds) {
    const p = (payouts.data ?? []).filter((r) => r.company_id === id)
    const { spentMinor, heldMinor } = simulatedSpend({
      payouts: p as SimSpendInputs["payouts"],
      ach: (ach.data ?? []).filter((r) => r.company_id === id) as SimSpendInputs["ach"],
      pix: (pix.data ?? []).filter((r) => r.company_id === id) as SimSpendInputs["pix"],
      brlRateMicro,
    })
    // Singapore payouts in progress whose USDC hasn't left yet are reserved (same rule as the treasury summary).
    const reserved = p
      .filter((r) => !isTerminal(r.status as PayoutStatus) && !r.tx_hash)
      .reduce((s, r) => s + BigInt(r.usdc_amount_minor as string | number), 0n)
    // Same rule as Available on the dashboard: only payments still in progress are taken off.
    // Settled simulated spends aren't (that USDC never left onchain).
    void spentMinor
    const total = heldMinor + reserved - (positions.get(id) ?? 0n)
    if (total !== 0n) out.set(id, total)
  }
  return out
}
