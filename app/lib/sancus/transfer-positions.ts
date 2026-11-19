// Sancus: what HQ (a root account) has gained or given through internal transfers. Server only.
//
// Internal transfers settle on Arc in fUSDC, the rail bot's mock dollar, so they never change HQ's
// real USDC wallet balance. Branches show their operating-bank balance, which a transfer already
// debits or credits, but HQ shows wallet USDC. Without this, money a branch sends to HQ leaves the
// branch and never shows up at HQ (and HQ funding a branch costs HQ nothing).
//
// Kept free of Circle/viem imports so balance routes stay light.
import type { SupabaseClient } from "@supabase/supabase-js"

/** rootId → USDC minor units in minus out, over completed internal transfers (may be negative). */
export async function loadRootTransferPositions(db: SupabaseClient, rootIds: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>()
  if (!rootIds.length) return out
  const list = rootIds.join(",")
  const { data, error } = await db
    .from("sancus_internal_transfers")
    .select("source_company_id, destination_company_id, usdc_amount_minor")
    .eq("status", "COMPLETED")
    .or(`source_company_id.in.(${list}),destination_company_id.in.(${list})`)
  if (error) {
    console.error("Could not load internal transfer positions", error)
    return out
  }
  const roots = new Set(rootIds)
  for (const row of data ?? []) {
    const amount = BigInt(row.usdc_amount_minor as string | number)
    if (roots.has(row.destination_company_id)) out.set(row.destination_company_id, (out.get(row.destination_company_id) ?? 0n) + amount)
    if (roots.has(row.source_company_id)) out.set(row.source_company_id, (out.get(row.source_company_id) ?? 0n) - amount)
  }
  return out
}
