export type XenditRail = "PROMPTPAY" | "BI_FAST" | "INSTAPAY" | "PESONET"
export type XenditPayoutState = "PENDING" | "COMPLIANCE_REVIEW" | "SETTLED" | "FAILED" | "REVERSED" | "CANCELLED"

export type XenditPayoutDto = {
  id: string
  purpose: "EMPLOYEE_SPEND" | "SUPPLIER_PAYMENT"
  employeeName: string | null
  country: "TH" | "ID" | "PH"
  rail: XenditRail
  currency: "THB" | "IDR" | "PHP"
  recipientName: string
  accountNumberMasked: string
  routingType: string
  routingValue: string
  amountMinor: string
  description: string | null
  providerTransactionId: string
  providerStatus: string
  status: XenditPayoutState
  failureReason: string | null
  settledAt: string | null
  createdAt: string
  simulated: boolean
  txHash: string | null
  explorer: string | null
}

export type XenditPayoutRow = {
  id: string; purpose: XenditPayoutDto["purpose"]; employee_name: string | null;
  country: XenditPayoutDto["country"]; rail: XenditRail; currency: XenditPayoutDto["currency"];
  recipient_name: string; account_number_masked: string; routing_type: string; routing_value: string;
  amount_minor: number | string; description: string | null; provider_transaction_id: string;
  provider_status: string; status: XenditPayoutState; failure_reason: string | null;
  settled_at: string | null; created_at: string; simulated: boolean;
  tx_hash?: string | null; source_address?: string | null; settlement_address?: string | null;
}

export function toXenditPayoutDto(row: XenditPayoutRow): XenditPayoutDto {
  const txHash = row.tx_hash ?? null
  return {
    id: row.id, purpose: row.purpose, employeeName: row.employee_name, country: row.country,
    rail: row.rail, currency: row.currency, recipientName: row.recipient_name,
    accountNumberMasked: row.account_number_masked, routingType: row.routing_type,
    routingValue: row.routing_value, amountMinor: String(row.amount_minor), description: row.description,
    providerTransactionId: row.provider_transaction_id, providerStatus: row.provider_status,
    status: row.status, failureReason: row.failure_reason, settledAt: row.settled_at,
    createdAt: row.created_at, simulated: row.simulated,
    txHash,
    explorer: txHash ? `https://explorer.testnet.arc.io/tx/${txHash}` : null,
  }
}

export function maskAccountNumber(value: string) {
  const compact = value.replace(/\s/g, "")
  if (compact.length <= 4) return `••${compact.slice(-2)}`
  return `${"•".repeat(Math.min(8, compact.length - 4))}${compact.slice(-4)}`
}
