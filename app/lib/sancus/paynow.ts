// Sancus: Singapore recipient validation and rail selection (PayNow vs FAST).
// PayNow is an addressing layer on top of FAST, so both share the S$200,000
// per-transaction FAST cap.

export type ProxyType = "MOBILE" | "UEN" | "BANK"
export type SgRail = "PAYNOW" | "FAST"

export const FAST_LIMIT_SGD_MINOR = 200_000_00n // S$200,000.00

export type SgRecipient = {
  name: string
  proxyType: ProxyType
  /** Mobile (+65XXXXXXXX), UEN, or bank account number */
  proxyValue: string
  /** Required for BANK: SWIFT/BIC of the recipient bank, e.g. DBSSSGSG */
  bankCode?: string
}

export type ValidationError = { field: keyof SgRecipient | "amount"; message: string }

/** Normalises a Singapore mobile number to +65XXXXXXXX, or returns null. */
export function normaliseSgMobile(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "").replace(/^\+?65/, "")
  return /^[89]\d{7}$/.test(digits) ? `+65${digits}` : null
}

/**
 * Singapore UEN formats:
 *  - Businesses (ACRA):       8 digits + check letter, e.g. 53123456A
 *  - Local companies (ACRA):  YYYY + 5 digits + check letter, e.g. 201912345K
 *  - Other entities:          T/S/R + YY + 2-letter entity type + 4 digits + check letter, e.g. T09LL0001B
 * Check letters are not verified here; the payout partner validates them.
 */
export function isValidUen(raw: string): boolean {
  const v = raw.trim().toUpperCase()
  return (
    /^\d{8}[A-Z]$/.test(v) ||
    /^(19|20)\d{2}\d{5}[A-Z]$/.test(v) ||
    /^[TSR]\d{2}[A-Z]{2}\d{4}[A-Z]$/.test(v)
  )
}

export function isValidBic(raw: string): boolean {
  return /^[A-Z]{4}SG[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw.trim().toUpperCase())
}

export function isValidSgAccountNumber(raw: string): boolean {
  return /^\d{6,17}$/.test(raw.replace(/[\s-]/g, ""))
}

export function validateRecipient(r: SgRecipient): ValidationError[] {
  const errors: ValidationError[] = []
  if (!r.name.trim()) errors.push({ field: "name", message: "Recipient name is required" })

  if (r.proxyType === "MOBILE" && !normaliseSgMobile(r.proxyValue)) {
    errors.push({ field: "proxyValue", message: "Enter a Singapore mobile number, e.g. +65 9123 4567" })
  }
  if (r.proxyType === "UEN" && !isValidUen(r.proxyValue)) {
    errors.push({ field: "proxyValue", message: "Enter a valid UEN, e.g. 201912345K" })
  }
  if (r.proxyType === "BANK") {
    if (!isValidSgAccountNumber(r.proxyValue)) {
      errors.push({ field: "proxyValue", message: "Enter a bank account number (6 to 17 digits)" })
    }
    if (!r.bankCode || !isValidBic(r.bankCode)) {
      errors.push({ field: "bankCode", message: "Enter the bank's SWIFT code, e.g. DBSSSGSG" })
    }
  }
  return errors
}

/** Canonical form stored and sent to the partner. */
export function normaliseRecipient(r: SgRecipient): SgRecipient {
  if (r.proxyType === "MOBILE") return { ...r, name: r.name.trim(), proxyValue: normaliseSgMobile(r.proxyValue) ?? r.proxyValue }
  if (r.proxyType === "UEN") return { ...r, name: r.name.trim(), proxyValue: r.proxyValue.trim().toUpperCase() }
  return {
    ...r,
    name: r.name.trim(),
    proxyValue: r.proxyValue.replace(/[\s-]/g, ""),
    bankCode: r.bankCode?.trim().toUpperCase(),
  }
}

export type RailChoice = {
  rail: SgRail
  /** Why this rail was picked, shown in the UI. */
  reason: string
  etaLabel: string
}

/** PayNow when the recipient has a proxy (mobile/UEN), FAST for a raw bank account. */
export function chooseRail(r: SgRecipient): RailChoice {
  if (r.proxyType === "BANK") {
    return {
      rail: "FAST",
      reason: "Bank account given, so the payout goes over FAST directly.",
      etaLabel: "Usually within seconds",
    }
  }
  return {
    rail: "PAYNOW",
    reason: `PayNow resolves the ${r.proxyType === "MOBILE" ? "mobile number" : "UEN"} to the recipient's bank and settles over FAST.`,
    etaLabel: "Usually within seconds",
  }
}

export function maskProxy(r: Pick<SgRecipient, "proxyType" | "proxyValue">): string {
  const v = r.proxyValue
  if (v.length <= 4) return v
  return r.proxyType === "UEN" ? v : `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`
}
