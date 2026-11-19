import type { SupabaseClient } from "@supabase/supabase-js"
import { storeGatewayEOAWalletsForUser } from "@/lib/circle/create-gateway-eoa-wallets"
import { createCompanyWallet } from "./company-wallets"
import { circleConfigured, TREASURY_CHAIN } from "./provision"
import { rootGatewaySigner, rootTreasuryWallet, type RootTreasuryContext } from "./root-treasury"
import type { CompanyRow } from "./companies"

export type RootTreasuryProvisionResult =
  | { ok: true; created: string[]; notes: string[]; wallet: Awaited<ReturnType<typeof rootTreasuryWallet>>; signerAddress: string | null }
  | { ok: false; status: number; error: string }

/** Create only the parent company's Arc treasury and Gateway delegate. */
export async function provisionRootTreasury(
  supabase: SupabaseClient,
  root: RootTreasuryContext
): Promise<RootTreasuryProvisionResult> {
  if (!circleConfigured()) return { ok: false, status: 503, error: "Circle testnet wallets are not configured" }

  const created: string[] = []
  const notes: string[] = []
  let wallet = await rootTreasuryWallet(supabase, root)
  if (!wallet) {
    const { data: company, error } = await supabase
      .from("sancus_companies")
      .select("*")
      .eq("id", root.companyId)
      .is("parent_id", null)
      .maybeSingle()
    if (error || !company) return { ok: false, status: error?.code === "42501" ? 403 : 404, error: "Parent company not found" }
    const result = await createCompanyWallet(
      supabase,
      root.userId,
      company as CompanyRow,
      `${root.companyName} treasury`,
      "treasury"
    )
    if (!result.ok) return result
    created.push("Parent treasury wallet")
    wallet = await rootTreasuryWallet(supabase, root)
  }

  const existingSigner = await rootGatewaySigner(supabase, root)
  let signerAddress: string | null = existingSigner?.address ?? null
  try {
    if (!existingSigner) {
      const signers = await storeGatewayEOAWalletsForUser(root.userId, root.companyId, supabase)
      const signer = signers.find((item) => item.blockchain === TREASURY_CHAIN)
      signerAddress = signer?.address ?? null
      if (signerAddress) created.push("Parent Gateway signer")
    }
  } catch (cause) {
    notes.push(`Gateway signer setup needs attention: ${cause instanceof Error ? cause.message : String(cause)}`)
  }

  const configuredPayTo = process.env.X402_PAY_TO_ADDRESS?.trim().toLowerCase()
  if (signerAddress && configuredPayTo !== signerAddress.toLowerCase()) {
    notes.push("Set X402_PAY_TO_ADDRESS to the parent Gateway signer before testing paid agent requests.")
  }
  return { ok: true, created: [...new Set(created)], notes, wallet, signerAddress }
}
