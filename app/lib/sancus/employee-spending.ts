export type EmployeeCardPurchaseStatus = "HELD" | "SETTLED" | "RELEASED" | "DECLINED"

export type EmployeeCardPurchaseDto = {
  id: string
  cardId: string | null
  spendingMethodId: string | null
  employeeName: string
  merchantName: string
  amountMinor: string
  currency: string
  status: EmployeeCardPurchaseStatus
  declineReason: string | null
  authorizedAt: string
  settledAt: string | null
}

export type EmployeeCardPurchaseRow = {
  id: string
  card_id: string | null
  spending_method_id: string | null
  employee_name: string
  merchant_name: string
  amount_minor: number | string
  currency: string
  status: EmployeeCardPurchaseStatus
  decline_reason: string | null
  authorized_at: string
  settled_at: string | null
}

export function toEmployeeCardPurchaseDto(row: EmployeeCardPurchaseRow): EmployeeCardPurchaseDto {
  return {
    id: row.id,
    cardId: row.card_id,
    spendingMethodId: row.spending_method_id,
    employeeName: row.employee_name,
    merchantName: row.merchant_name,
    amountMinor: String(row.amount_minor),
    currency: row.currency,
    status: row.status,
    declineReason: row.decline_reason,
    authorizedAt: row.authorized_at,
    settledAt: row.settled_at,
  }
}
