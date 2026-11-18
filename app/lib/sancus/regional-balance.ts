import type { SupabaseClient } from "@supabase/supabase-js"

export type RegionalBalanceDto = {
  country: "BR"
  currency: "BRL"
  openingMinor: string
  inboundMinor: string
  outboundMinor: string
  availableMinor: string
  updatedAt: string
}

function openingBalanceMinor() {
  const raw = process.env.SANCUS_DEMO_BRL_OPENING_BALANCE_MINOR?.trim()
  if (!raw || !/^\d+$/.test(raw)) return 500_000n
  return BigInt(raw)
}

function total(rows: Array<{ amount_local_minor?: number | string; amount_brl_minor?: number | string }> | null, field: "amount_local_minor" | "amount_brl_minor") {
  return (rows ?? []).reduce((sum, row) => sum + BigInt(row[field] ?? 0), 0n)
}

export async function getRegionalBalance(supabase: SupabaseClient, userId: string): Promise<RegionalBalanceDto> {
  const [collections, payments] = await Promise.all([
    supabase
      .from("sancus_collections")
      .select("amount_local_minor")
      .eq("user_id", userId)
      .eq("rail", "PIX")
      .eq("status", "SETTLED"),
    supabase
      .from("sancus_pix_payments")
      .select("amount_brl_minor")
      .eq("user_id", userId)
      .eq("status", "SETTLED"),
  ])
  if (collections.error || payments.error) throw new Error("Could not calculate the Brazil balance")

  const opening = openingBalanceMinor()
  const inbound = total(collections.data, "amount_local_minor")
  const outbound = total(payments.data, "amount_brl_minor")
  return {
    country: "BR",
    currency: "BRL",
    openingMinor: opening.toString(),
    inboundMinor: inbound.toString(),
    outboundMinor: outbound.toString(),
    availableMinor: (opening + inbound - outbound).toString(),
    updatedAt: new Date().toISOString(),
  }
}
