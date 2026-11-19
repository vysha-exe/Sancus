// Sancus: shared bits for the ACH payment routes (server only).
import type { SupabaseClient } from "@supabase/supabase-js"
import { evmAddressSchema } from "@/lib/api/validate"
import { type AchQuote, type AchRecipientRow, quoteAch, settlementModeFromEnv } from "./ach"
import { evaluatePayout, isNewAchRecipient, loadPolicy, spentToday, type Evaluation } from "./policy"
import { type AchSpeed, demoModeFromEnv } from "./rails/ach-sim"

export async function getRecipient(db: SupabaseClient, userId: string, id: string): Promise<AchRecipientRow | null> {
  const { data } = await db.from("sancus_ach_recipients").select("*").eq("user_id", userId).eq("id", id).maybeSingle()
  return (data as AchRecipientRow | null) ?? null
}

/** Treasury (source) and settlement wallet for TESTNET_SETTLEMENT. */
export async function settlementWallets(db: SupabaseClient, userId: string, companyId: string | null = null) {
  const { data } = await db
    .from("wallets")
    .select("address, type")
    .eq("user_id", userId)
    .eq("blockchain", "ARC-TESTNET")
    .in("type", ["treasury", "payout"])
    .is("company_id", null)
    .order("created_at", { ascending: true })
  // Paying wallet: the company's own treasury when acting for a company, else the personal one.
  let treasury = data?.find((w) => w.type === "treasury")?.address ?? null
  if (companyId) {
    const { data: companyWallets } = await db.from("wallets").select("address").eq("company_id", companyId).or("type.is.null,type.neq.payout").order("created_at").limit(1)
    treasury = (companyWallets?.[0]?.address as string | undefined) ?? treasury
  }
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
  const policy = await loadPolicy(db, userId)
  const evaluation = evaluatePayout({
    policy,
    amountMinor: q.quote.usdcAmountMinor,
    recipient: { name: recipient.name, proxyValue: `${recipient.routing_number}:${recipient.account_last4}` },
    spentTodayMinor: await spentToday(db, userId),
    isNewRecipient: policy.rules.newRecipients ? await isNewAchRecipient(db, userId, recipient.id) : false,
  })
  return { ok: true, recipient, quote: q.quote, evaluation }
}
