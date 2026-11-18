// Sancus: local-rail collections. A customer pays by QRIS / PromptPay / Pix (sandbox); once the
// rail reports PAID, the rail bot mints the matching mock stablecoin (mIDR / mTHB / mBRL) into
// the account's wallet for that country (a branch wallet if one exists, else the Treasury).
// Server only. Minting happens at most once per charge (status claim PAID → MINTING).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Address } from "viem"
import { MOCK_TOKENS, railMint } from "./mock-tokens"
import { chargeStatus, type CreatedCharge, type LocalRail, RAIL_INFO } from "./local-sandboxes"
import { listTreasuryWallets } from "./provision"

export type CollectionRow = {
  id: string
  user_id: string
  rail: LocalRail
  currency: "IDR" | "THB" | "BRL"
  amount_minor: number | string
  provider: CreatedCharge["provider"]
  provider_ref: string
  status: "PENDING" | "PAID" | "MINTING" | "MINTED" | "FAILED" | "EXPIRED"
  simulated: boolean
  qr_image_url: string | null
  qr_payload: string | null
  simulator_url: string | null
  destination_address: string
  destination_label: string | null
  token_address: string
  mint_tx: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type Destination = { address: string; label: string }

/** Branch wallet in the rail's country if the user can see one, else their personal Treasury. */
export async function resolveDestination(supabase: SupabaseClient, userId: string, rail: LocalRail): Promise<Destination | null> {
  const { country } = RAIL_INFO[rail]
  const { data: nodes } = await supabase.from("sancus_companies").select("id, name").eq("country", country).order("created_at")
  const ids = (nodes ?? []).map((n) => n.id as string)
  if (ids.length) {
    const { data: wallets } = await supabase
      .from("wallets")
      .select("address, name, company_id")
      .in("company_id", ids)
      .order("created_at")
      .limit(1)
    const w = wallets?.[0]
    if (w) {
      const node = nodes!.find((n) => n.id === w.company_id)
      return { address: w.address as string, label: node ? `${node.name} (branch)` : (w.name as string) }
    }
  }
  const treasury = (await listTreasuryWallets(supabase, userId)).find((w) => w.type === "treasury")
  return treasury ? { address: treasury.address, label: "Treasury" } : null
}

type Mint = typeof railMint
type Status = typeof chargeStatus

/**
 * Brings one collection up to date: polls the rail while PENDING, and mints once it's PAID.
 * Safe to call repeatedly or concurrently.
 */
export async function refreshCollection(
  supabase: SupabaseClient,
  row: CollectionRow,
  deps: { mint: Mint; status: Status } = { mint: railMint, status: chargeStatus }
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

  // Claim the mint. Only one caller wins the PAID → MINTING transition.
  const { data: claimed } = await supabase
    .from("sancus_rail_collections")
    .update({ status: "MINTING" })
    .eq("id", current.id)
    .eq("status", "PAID")
    .select()
    .maybeSingle()
  if (!claimed) return current

  try {
    const hash = await deps.mint(current.currency, current.destination_address as Address, BigInt(current.amount_minor), `sancus:${current.rail}:${current.provider_ref}`)
    const { data } = await supabase
      .from("sancus_rail_collections")
      .update({ status: "MINTED", mint_tx: hash, error: null })
      .eq("id", current.id)
      .select()
      .maybeSingle()
    return (data as CollectionRow | null) ?? { ...current, status: "MINTED", mint_tx: hash }
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : String(e)
    // Put it back to PAID so the next refresh retries the mint.
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
    mintExplorer: row.mint_tx ? `https://explorer.testnet.arc.io/tx/${row.mint_tx}` : null,
    error: row.error,
    createdAt: row.created_at,
  }
}
