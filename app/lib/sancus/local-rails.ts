export type LocalRailStatus = "PENDING" | "SETTLED" | "FAILED" | "EXPIRED" | "CANCELLED"
export type CollectionRail = "QRIS" | "PROMPTPAY" | "PIX"

export type CollectionDto = {
  id: string
  rail: CollectionRail
  provider: "MIDTRANS" | "OMISE" | "PAYZU"
  customerName: string | null
  reference: string | null
  currency: "IDR" | "THB" | "BRL"
  amountLocalMinor: string
  providerTransactionId: string
  providerStatus: string
  status: LocalRailStatus
  qrImageUrl: string | null
  qrPayload: string | null
  simulatorUrl: string | null
  failureReason: string | null
  settledAt: string | null
  createdAt: string
  simulated: boolean
}

export type PixPaymentDto = {
  id: string
  purpose: "EMPLOYEE_SPEND" | "SUPPLIER_PAYMENT"
  spendingMethodId: string | null
  employeeId: string | null
  employeeName: string | null
  recipientName: string
  pixMethod: "QR" | "KEY"
  amountBrlMinor: string
  providerTransactionId: string
  providerStatus: string
  status: LocalRailStatus
  endToEndId: string | null
  failureReason: string | null
  settledAt: string | null
  createdAt: string
  simulated: true
}

export type SpendingMethodDto = {
  id: string
  employeeId: string
  employeeName: string
  type: "PIX"
  provider: "PAYZU"
  label: string
  currency: "BRL"
  monthlyLimitMinor: string
  usedMinor: string
  status: "ACTIVE" | "PAUSED" | "REVOKED"
  createdAt: string
}

export type CollectionDbRow = {
  id: string; rail: CollectionRail; provider: CollectionDto["provider"]; customer_name: string | null;
  reference: string | null; currency: CollectionDto["currency"]; amount_local_minor: number | string;
  provider_transaction_id: string; provider_status: string; status: LocalRailStatus;
  qr_image_url: string | null; qr_payload: string | null; simulator_url: string | null;
  failure_reason: string | null; settled_at: string | null; created_at: string; simulated: boolean;
}

export type PixPaymentDbRow = {
  id: string; purpose: PixPaymentDto["purpose"]; spending_method_id: string | null; employee_id: string | null; employee_name: string | null;
  recipient_name: string; pix_method: PixPaymentDto["pixMethod"]; amount_brl_minor: number | string;
  provider_transaction_id: string; provider_status: string; status: LocalRailStatus; end_to_end_id: string | null;
  failure_reason: string | null; settled_at: string | null; created_at: string;
}

export function toCollectionDto(row: CollectionDbRow): CollectionDto {
  return {
    id: row.id, rail: row.rail, provider: row.provider, customerName: row.customer_name,
    reference: row.reference, currency: row.currency, amountLocalMinor: String(row.amount_local_minor),
    providerTransactionId: row.provider_transaction_id, providerStatus: row.provider_status,
    status: row.status, qrImageUrl: row.qr_image_url, qrPayload: row.qr_payload,
    simulatorUrl: row.simulator_url, failureReason: row.failure_reason,
    settledAt: row.settled_at, createdAt: row.created_at, simulated: row.simulated,
  }
}

export function toPixPaymentDto(row: PixPaymentDbRow): PixPaymentDto {
  return {
    id: row.id, purpose: row.purpose, spendingMethodId: row.spending_method_id, employeeId: row.employee_id, employeeName: row.employee_name,
    recipientName: row.recipient_name, pixMethod: row.pix_method,
    amountBrlMinor: String(row.amount_brl_minor), providerTransactionId: row.provider_transaction_id,
    providerStatus: row.provider_status, status: row.status, endToEndId: row.end_to_end_id,
    failureReason: row.failure_reason, settledAt: row.settled_at, createdAt: row.created_at,
    simulated: true,
  }
}

export function toSpendingMethodDto(row: {
  id: string; employee_id: string; employee_name: string; method_type: "PIX"; provider: "PAYZU";
  label: string; currency: "BRL"; monthly_limit_minor: number | string;
  status: SpendingMethodDto["status"]; created_at: string;
}, usedMinor: bigint = 0n): SpendingMethodDto {
  return {
    id: row.id, employeeId: row.employee_id, employeeName: row.employee_name,
    type: row.method_type, provider: row.provider, label: row.label, currency: row.currency,
    monthlyLimitMinor: String(row.monthly_limit_minor), usedMinor: usedMinor.toString(),
    status: row.status, createdAt: row.created_at,
  }
}

export function maskPixKey(value?: string) {
  if (!value) return null
  if (value.length <= 6) return `${value.slice(0, 2)}•••`
  return `${value.slice(0, 3)}•••${value.slice(-3)}`
}

