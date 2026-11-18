// Sancus invoices: DTO and row mappers shared by the API routes and the invoice screens.
export type InvoiceStatus = "DRAFT" | "READY" | "PAID"

export const INVOICE_CURRENCIES = ["USD", "EUR", "BRL", "IDR", "THB"] as const
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number]
export const INVOICE_RAILS = ["ACH", "SEPA", "WIRE", "USDC", "PIX"] as const

export type InvoiceRow = {
  id: string
  user_id: string
  file_name: string
  storage_path: string | null
  supplier_name: string | null
  invoice_number: string | null
  amount_minor: number | string | null
  currency: string | null
  due_date: string | null
  rail: string | null
  status: InvoiceStatus
  extracted: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type InvoiceDto = {
  id: string
  fileName: string
  storagePath: string | null
  supplierName: string | null
  invoiceNumber: string | null
  /** Minor units as a string (bigint-safe). */
  amountMinor: string | null
  /** Decimal amount in the invoice currency, e.g. 3200 or 1250.5. */
  amount: number | null
  currency: string
  dueDate: string | null
  rail: string | null
  status: InvoiceStatus
  createdAt: string
  updatedAt: string
}

/** Context handed from the confirm screen to the pay flow (sessionStorage). */
export type InvoicePayContext = {
  invoiceId: string
  supplier: string
  amount: number
  currency: string
  invoiceNumber: string | null
}

export const INVOICE_PAY_STORAGE_KEY = "sancus-invoice-pay"

export const currencyDecimals = (currency: string) => (currency === "IDR" ? 0 : 2)

export function amountToMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyDecimals(currency))
}

export function minorToAmount(minor: number | string, currency: string): number {
  return Number(minor) / 10 ** currencyDecimals(currency)
}

export function toInvoiceDto(row: InvoiceRow): InvoiceDto {
  const currency = row.currency || "USD"
  const hasAmount = row.amount_minor !== null && row.amount_minor !== undefined
  return {
    id: row.id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    supplierName: row.supplier_name,
    invoiceNumber: row.invoice_number,
    amountMinor: hasAmount ? String(row.amount_minor) : null,
    amount: hasAmount ? minorToAmount(row.amount_minor!, currency) : null,
    currency,
    dueDate: row.due_date,
    rail: row.rail,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
