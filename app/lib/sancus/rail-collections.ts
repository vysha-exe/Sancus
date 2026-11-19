// Sancus: local-rail collections. A customer pays by QRIS / PromptPay / Pix (sandbox); once the
// rail reports PAID, the proceeds settle into that branch's local operating bank account.
// Arc wallets are separate temporary liquidity and are not credited by this flow.

import type { SupabaseClient } from "@supabase/supabase-js"
import { MOCK_TOKENS } from "./mock-tokens"
import { chargeStatus, type CreatedCharge, type LocalRail, RAIL_INFO } from "./local-sandboxes"

export type CollectionRow = {
  id: string
  user_id: string
  company_id: string | null
  receive_account_id: string | null
  rail: LocalRail
  currency: "IDR" | "THB" | "BRL"
  amount_minor: number | string
  provider: CreatedCharge["provider"]
  provider_ref: string
  status: "PENDING" | "PAID" | "CREDITING" | "CREDITED" | "MINTING" | "MINTED" | "FAILED" | "EXPIRED"
  simulated: boolean
  qr_image_url: string | null
  qr_payload: string | null
  simulator_url: string | null
  destination_address: string
  destination_label: string | null
  token_address: string
  mint_tx: string | null
  bank_credited_at: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type Destination = { address: string; label: string; companyId: string; receiveAccountId: string }

/** Branch operating bank account for the rail's country. Parent Treasury is intentionally excluded. */
export async function resolveDestination(supabase: SupabaseClient, userId: string, rail: LocalRail): Promise<Destination | null> {
  const { country } = RAIL_INFO[rail]
  const { data: nodes } = await supabase.from("sancus_companies").select("id, name").eq("country", country).order("created_at")
  const ids = (nodes ?? []).map((n) => n.id as string)
  if (ids.length) {
    const { data: accounts } = await supabase
      .from("sancus_receive_accounts")
      .select("id, company_id, bank_name, account_number")
      .in("company_id", ids)
      .order("created_at")
      .limit(1)
    const account = accounts?.[0]
    if (account) {
      const node = nodes!.find((n) => n.id === account.company_id)
      return {
        address: account.account_number as string,
        label: node ? `${account.bank_name} · ${node.name}` : String(account.bank_name),
        companyId: account.company_id as string,
        receiveAccountId: account.id as string,
      }
    }
  }
  void userId
  return null
}

type Status = typeof chargeStatus
type Credit = (supabase: SupabaseClient, row: CollectionRow) => Promise<CollectionRow>

async function creditBankAccount(supabase: SupabaseClient, row: CollectionRow): Promise<CollectionRow> {
  const { data, error } = await supabase.rpc("sancus_credit_collection_to_bank", { p_collection_id: row.id })
  const credited = Array.isArray(data) ? data[0] : data
  if (error || !credited) throw new Error(error?.message || "Could not credit the receiving bank account")
  return credited as CollectionRow
}

/**
 * Brings one collection up to date: polls the rail while PENDING, and mints once it's PAID.
 * Safe to call repeatedly or concurrently.
 */
export async function refreshCollection(
  supabase: SupabaseClient,
  row: CollectionRow,
  deps: { credit?: Credit; status: Status } = { status: chargeStatus }
): Promise<CollectionRow> {
  let current = row

  if (current.status === "PENDING") {
    let next: CollectionRow["status"]
    try {
      next = await deps.status(current.provider, current.provider_ref, new Date(current.created_at))
    } catch (e) {
      return { ...current, error: e instanceof Error ? e.message : String(e) }
    }
    if (next !== "PENDING") {
      const { data } = await supabase
        .from("sancus_rail_collections")
        .update({ status: next, error: null })
        .eq("id", current.id)
        .eq("status", "PENDING")
        .select()
        .maybeSingle()
      current = (data as CollectionRow | null) ?? { ...current, status: next }
    }
  }

  if (current.status !== "PAID") return current

  try {
    return await (deps.credit ?? creditBankAccount)(supabase, current)
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : String(e)
    await supabase.from("sancus_rail_collections").update({ status: "PAID", error: message }).eq("id", current.id)
    return { ...current, status: "PAID", error: message }
  }
}

export function toApi(row: CollectionRow) {
  const token = MOCK_TOKENS[row.currency]
  return {
    id: row.id,
    rail: row.rail,
    railLabel: RAIL_INFO[row.rail].label,
    currency: row.currency,
    amountMinor: String(row.amount_minor),
    provider: row.provider,
    providerRef: row.provider_ref,
    status: row.status,
    simulated: row.simulated,
    qrImageUrl: row.qr_image_url,
    qrPayload: row.qr_payload,
    simulatorUrl: row.simulator_url,
    destination: { address: row.destination_address, label: row.destination_label },
    token: { symbol: token.symbol, address: row.token_address, explorer: token.explorer },
    mintTx: row.mint_tx,
    mintExplorer: null,
    bankCreditedAt: row.bank_credited_at,
    error: row.error,
    createdAt: row.created_at,
  }
}
