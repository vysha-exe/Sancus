// Sancus: shared bits for the ACH payment routes (server only).
import type { SupabaseClient } from "@supabase/supabase-js"
import { evmAddressSchema } from "@/lib/api/validate"
import { type AchQuote, type AchRecipientRow, quoteAch, settlementModeFromEnv } from "./ach"
import { evaluatePayout, loadPolicy, spentToday, type Evaluation } from "./policy"
import { type AchSpeed, demoModeFromEnv } from "./rails/ach-sim"

export async function getRecipient(db: SupabaseClient, userId: string, id: string): Promise<AchRecipientRow | null> {
  const { data } = await db.from("sancus_ach_recipients").select("*").eq("user_id", userId).eq("id", id).maybeSingle()
  return (data as AchRecipientRow | null) ?? null
}

/** Treasury (source) and settlement wallet for TESTNET_SETTLEMENT. */
export async function settlementWallets(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from("wallets")
    .select("address, type")
    .eq("user_id", userId)
    .eq("blockchain", "ARC-TESTNET")
    .in("type", ["treasury", "payout"])
    .is("company_id", null)
    .order("created_at", { ascending: true })
  const treasury = data?.find((w) => w.type === "treasury")?.address ?? null
  const envAddr = process.env.ACH_SETTLEMENT_ADDRESS?.trim()
  const settlement = envAddr && evmAddressSchema.safeParse(envAddr).success ? envAddr : (data?.find((w) => w.type === "payout")?.address ?? null)
  return { treasury: treasury as string | null, settlement: settlement as string | null }
}

export type PreparedAch =
  | { ok: true; recipient: AchRecipientRow; quote: AchQuote; evaluation: Evaluation }
  | { ok: false; status: number; body: Record<string, unknown> }

/** Recipient + fresh server-side quote + spending policy. Shared by quote and create. */
export async function prepareAch(db: SupabaseClient, userId: string, input: { recipientId: string; usdAmount: string; speed: AchSpeed }): Promise<PreparedAch> {
  const recipient = await getRecipient(db, userId, input.recipientId)
  if (!recipient) return { ok: false, status: 404, body: { error: "Recipient not found" } }
  const q = quoteAch(input.usdAmount, input.speed, { settlementMode: settlementModeFromEnv(), demoMode: demoModeFromEnv() })
  if (!q.ok) return { ok: false, status: 400, body: { error: q.issues[0]!.message, issues: q.issues } }
  const evaluation = evaluatePayout({
    policy: await loadPolicy(db, userId),
    amountMinor: q.quote.usdcAmountMinor,
    recipient: { name: recipient.name, proxyValue: `${recipient.routing_number}:${recipient.account_last4}` },
    spentTodayMinor: await spentToday(db, userId),
  })
  return { ok: true, recipient, quote: q.quote, evaluation }
}
