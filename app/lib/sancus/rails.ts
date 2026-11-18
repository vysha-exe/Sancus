/** Public-site copy for the nine ways to pay. Matches the Rails and fees table in the wireframes. */
export type SiteRail = {
  name: string
  use: string
  speed: string
  fee: string
  /** Every rail except USDC is simulated in the prototype. */
  simulated: boolean
}

export const SITE_RAILS: readonly SiteRail[] = [
  { name: "USDC", use: "Businesses with a USDC account", speed: "Seconds", fee: "$0.00", simulated: false },
  { name: "ACH", use: "US bank accounts", speed: "1–2 days", fee: "$0.00", simulated: true },
  { name: "Wire", use: "Bank accounts anywhere", speed: "Same or next day", fee: "$3.50", simulated: true },
  { name: "Pix", use: "Brazil, bank or QR", speed: "Seconds", fee: "$0.80", simulated: true },
  { name: "SEPA", use: "Euro bank accounts", speed: "Same day", fee: "$0.80", simulated: true },
  { name: "SPEI", use: "Mexico", speed: "Minutes", fee: "$0.80", simulated: true },
  { name: "QRIS", use: "Indonesia QR", speed: "Seconds", fee: "$0.50", simulated: true },
  { name: "PromptPay", use: "Thailand QR", speed: "Seconds", fee: "$0.50", simulated: true },
  { name: "Card", use: "Team cards", speed: "Instant hold", fee: "$0.00", simulated: true },
]

/** Index of Pix, the rail the hero temple starts on. */
export const DEFAULT_RAIL_INDEX = 3
