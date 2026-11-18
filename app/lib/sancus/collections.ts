import type { SupabaseClient } from "@supabase/supabase-js"
import type { CollectionDbRow, CollectionRail, LocalRailStatus } from "./local-rails"
import { getQrisTransaction, mapQrisStatus } from "./rails/midtrans"
import { getOmiseCharge, mapOmiseStatus } from "./rails/omise"
import { getPixCollection, mapPayZuStatus } from "./rails/payzu"

export type CollectionRow = CollectionDbRow & {
  id: string
  user_id: string
  rail: CollectionRail
  provider: "MIDTRANS" | "OMISE" | "PAYZU"
  provider_transaction_id: string
  provider_status: string
  status: LocalRailStatus
}

export async function refreshCollection(supabase: SupabaseClient, row: CollectionRow) {
  let providerStatus = row.provider_status
  let status = row.status
  let failureReason: string | null = null
  let settledAt: string | null = null
  let payload: Record<string, unknown> = {}

  if (row.provider === "MIDTRANS") {
    const transaction = await getQrisTransaction(row.provider_transaction_id)
    providerStatus = transaction.transaction_status || providerStatus
    status = mapQrisStatus(providerStatus)
    failureReason = status === "FAILED" ? transaction.status_message || "QRIS payment failed" : null
    settledAt = status === "SETTLED" ? transaction.settlement_time || new Date().toISOString() : null
    payload = transaction
  } else if (row.provider === "OMISE") {
    const charge = await getOmiseCharge(row.provider_transaction_id)
    providerStatus = charge.status || providerStatus
    status = mapOmiseStatus(charge)
    failureReason = status === "FAILED" ? charge.failure_message || charge.failure_code || "PromptPay payment failed" : null
    settledAt = status === "SETTLED" ? new Date().toISOString() : null
    payload = charge
  } else {
    const transaction = await getPixCollection(row.provider_transaction_id)
    providerStatus = transaction.status || providerStatus
    status = mapPayZuStatus(providerStatus)
    failureReason = status === "FAILED" || status === "CANCELLED" ? transaction.cancellationReason || transaction.message || "Pix collection failed" : null
    settledAt = status === "SETTLED" ? transaction.paidAt || new Date().toISOString() : null
    payload = transaction
  }

  const terminal = new Set<LocalRailStatus>(["SETTLED", "FAILED", "EXPIRED", "CANCELLED"])
  if (terminal.has(row.status) && status === "PENDING") return row

  const { data, error } = await supabase
    .from("sancus_collections")
    .update({ provider_status: providerStatus, status, failure_reason: failureReason, settled_at: settledAt, provider_payload: payload })
    .eq("id", row.id)
    .select("*")
    .single()
  if (error || !data) throw new Error("Could not save collection status")
  return data as CollectionRow
}

