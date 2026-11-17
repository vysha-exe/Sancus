// Sancus: integer money helpers. All amounts are stored as bigint minor units
// (SGD cents = 2 decimals, USDC = 6 decimals). Never use floats for money.

export const SGD_DECIMALS = 2
export const USDC_DECIMALS = 6

/** Parse a user-entered decimal string ("1,234.5") into minor units. Returns null if invalid. */
export function parseToMinor(input: string, decimals: number): bigint | null {
  const cleaned = input.replace(/[,\s]/g, "")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const [whole, frac = ""] = cleaned.split(".")
  if (frac.length > decimals) return null
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0")
}

/** Format minor units as a plain decimal string with exactly `decimals` places. */
export function formatMinor(minor: bigint, decimals: number): string {
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  const base = 10n ** BigInt(decimals)
  const whole = abs / base
  const frac = (abs % base).toString().padStart(decimals, "0")
  return `${negative ? "-" : ""}${whole}${decimals > 0 ? "." + frac : ""}`
}

/** Human-friendly display with thousands separators, e.g. "S$1,234.50". */
export function displayMinor(minor: bigint, decimals: number, prefix = "", maxFraction = decimals): string {
  const [whole, frac = ""] = formatMinor(minor, decimals).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const trimmedFrac = frac.slice(0, maxFraction)
  return `${prefix}${grouped}${trimmedFrac ? "." + trimmedFrac : ""}`
}

/** Ceiling division for non-negative bigints. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b
}
