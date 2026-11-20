// Sancus QR payments, server side: who a code pays, where the money comes from and goes to.
import type { SupabaseClient, User } from "@supabase/supabase-js"
import type { SancusAccount } from "./accounts"
import type { SancusQrCurrency } from "./sancus-qr"

export const QR_DECIMALS: Record<SancusQrCurrency, number> = { USD: 2, THB: 2, IDR: 0, BRL: 2 }

/** The balance a QR code pays into / a QR payment comes out of: a company or branch for business
 *  accounts (the one being worked in, else the global account), the personal balance otherwise. */
export function qrCompanyFor(account: SancusAccount, workspaceCompanyId: string | null): string | null {
  if (account.type === "INDIVIDUAL" || account.type === "EMPLOYEE") return null
  return workspaceCompanyId ?? account.scopes.find((s) => s.isRoot)?.companyId ?? account.scopes[0]?.companyId ?? null
}

export function personName(user: Pick<User, "email" | "user_metadata">): string {
  const m = user.user_metadata ?? {}
  return [m.first_name, m.last_name].filter(Boolean).join(" ") || user.email?.split("@")[0] || "Sancus user"
}

/** Treasury wallet on Arc for a company node, or a person's personal treasury. */
export async function treasuryAddress(admin: SupabaseClient, userId: string, companyId: string | null): Promise<string | null> {
  let q = admin.from("wallets").select("address").eq("blockchain", "ARC-TESTNET").eq("type", "treasury").order("created_at", { ascending: true }).limit(1)
  q = companyId ? q.eq("company_id", companyId) : q.eq("user_id", userId).is("company_id", null)
  const { data } = await q
  return (data?.[0]?.address as string | undefined) ?? null
}

export type QrPaymentDto = {
  id: string
  direction: "in" | "out"
  counterparty: string
  currency: SancusQrCurrency
  amountMinor: string
  usdcAmountMinor: string
  note: string | null
  status: string
  /** fUSDC: burn from the payer */
  txHash: string | null
  /** fUSDC: mint to the receiver */
  mintTxHash: string | null
  createdAt: string
}

export function toQrPaymentDto(row: Record<string, unknown>, me: string): QrPaymentDto {
  const out = row.payer_user_id === me
  return {
    id: row.id as string,
    direction: out ? "out" : "in",
    counterparty: (out ? row.receiver_name : row.payer_name) as string,
    currency: row.currency as SancusQrCurrency,
    amountMinor: String(row.amount_minor),
    usdcAmountMinor: String(row.usdc_amount_minor),
    note: (row.note as string | null) ?? null,
    status: row.status as string,
    txHash: (row.tx_hash as string | null) ?? null,
    mintTxHash: (row.mint_tx_hash as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}
