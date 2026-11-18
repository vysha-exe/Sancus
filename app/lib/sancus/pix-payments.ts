import type { SupabaseClient } from "@supabase/supabase-js"
import type { LocalRailStatus, PixPaymentDbRow } from "./local-rails"
import { getPixPayment, mapPayZuStatus, simulatedPixStatus } from "./rails/payzu"

export type PixPaymentRow = PixPaymentDbRow & {
  id: string
  user_id: string
  provider_transaction_id: string
  provider_status: string
  status: LocalRailStatus
}

export async function refreshPixPayment(supabase: SupabaseClient, row: PixPaymentRow) {
  const transaction = row.simulated
    ? simulatedPixStatus(row.provider_transaction_id)
    : await getPixPayment(row.provider_transaction_id)
  const providerStatus = transaction.status || row.provider_status
  const status = mapPayZuStatus(providerStatus)
  if (["SETTLED", "FAILED", "EXPIRED", "CANCELLED"].includes(row.status) && status === "PENDING") return row
  const { data, error } = await supabase.from("sancus_pix_payments").update({
    provider_status: providerStatus,
    status,
    end_to_end_id: transaction.endToEndId || null,
    failure_reason: status === "FAILED" || status === "CANCELLED" ? transaction.cancellationReason || transaction.message || "Pix payment failed" : null,
    provider_payload: transaction,
    settled_at: status === "SETTLED" ? transaction.paidAt || new Date().toISOString() : null,
  }).eq("id", row.id).select("*").single()
  if (error || !data) throw new Error("Could not save Pix payment status")
  return data as PixPaymentRow
}

