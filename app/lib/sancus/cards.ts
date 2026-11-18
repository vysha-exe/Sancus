export type SancusCardStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED"

export type SancusCardDto = {
  id: string
  employeeId: string
  employeeName: string
  label: string
  country: string
  currency: string
  monthlyLimitMinor: string
  lastFour: string
  status: SancusCardStatus
  providerStatus: string
  simulated: boolean
  createdAt: string
}

export type SancusCardRow = {
  id: string
  employee_id: string
  employee_name: string
  label: string
  country: string
  currency: string
  monthly_limit_minor: number | string
  last_four: string
  status: SancusCardStatus
  provider_status: string
  simulated: boolean
  created_at: string
}

export function toSancusCardDto(row: SancusCardRow): SancusCardDto {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    label: row.label,
    country: row.country,
    currency: row.currency,
    monthlyLimitMinor: String(row.monthly_limit_minor),
    lastFour: row.last_four,
    status: row.status,
    providerStatus: row.provider_status,
    simulated: row.simulated,
    createdAt: row.created_at,
  }
}
