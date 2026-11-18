// Sancus: the real Circle implementation of ProvisionDeps (server only).
import type { SupabaseClient } from "@supabase/supabase-js"
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client"
import { storeGatewayEOAWalletsForUser } from "@/lib/circle/create-gateway-eoa-wallets"
import { initiateDepositFromCustodialWallet } from "@/lib/circle/gateway-sdk"
import { syncGatewayWebhookSubscription } from "@/lib/circle/gateway-webhooks"
import { ensureTreasuryWallets, TREASURY_CHAIN, type ProvisionDeps, type ProvisionResult } from "./provision"

export function circleProvisionDeps(supabase: SupabaseClient): ProvisionDeps {
  return {
    async getWalletSetId(walletId) {
      const ref = await circleDeveloperSdk.getWallet({ id: walletId })
      return ref.data?.wallet?.walletSetId
    },
    async createWalletSet(name) {
      const set = await circleDeveloperSdk.createWalletSet({ name })
      return set.data?.walletSet?.id
    },
    async createWallets(walletSetId, count) {
      const res = await circleDeveloperSdk.createWallets({
        walletSetId,
        blockchains: [TREASURY_CHAIN],
        count,
        accountType: "SCA",
      })
      return (res.data?.wallets ?? []).map((w) => ({ id: w.id, address: w.address }))
    },
    async afterCreate(userId, rows) {
      const notes: string[] = []
      // Gateway signer (regular EOA) so the Treasury can spend its Gateway balance.
      try {
        const { data: signer } = await supabase
          .from("wallets")
          .select("address")
          .eq("user_id", userId)
          .eq("blockchain", TREASURY_CHAIN)
          .eq("type", "gateway_signer")
          .maybeSingle()
        let signerAddress = signer?.address as string | undefined
        if (!signerAddress) {
          const signers = await storeGatewayEOAWalletsForUser(userId)
          signerAddress = signers.find((s) => s.blockchain === TREASURY_CHAIN)?.address
        }
        const treasury = rows.find((r) => r.type === "treasury")
        if (signerAddress && treasury) {
          await initiateDepositFromCustodialWallet(treasury.circle_wallet_id, "arcTestnet", BigInt(0), signerAddress as `0x${string}`)
        }
      } catch (e) {
        notes.push(`Gateway signer setup skipped: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await syncGatewayWebhookSubscription(rows.map((r) => r.address))
      } catch (e) {
        notes.push(`Webhook registration skipped: ${e instanceof Error ? e.message : String(e)}`)
      }
      return notes
    },
  }
}

/** Convenience: provision with real Circle calls. Never throws. */
export async function provisionTreasury(supabase: SupabaseClient, userId: string): Promise<ProvisionResult> {
  try {
    return await ensureTreasuryWallets(supabase, userId, circleProvisionDeps(supabase))
  } catch (e) {
    return { ok: false, reason: "circle-error", message: e instanceof Error ? e.message : String(e), wallets: [] }
  }
}
