/**
 * Fixed hackathon-demo rates. These are deliberately not market quotes and do
 * not expire. Every admin surface should read from this table so the demo never
 * changes values between screens.
 */
export const FIXED_USD_RATES = {
  USD: 1,
  USDC: 1,
  BRL: 5.4123,
  SGD: 1.3359,
  MXN: 17.24,
  EUR: 0.92,
  IDR: 16_000,
  THB: 35,
  CAD: 1.36,
  GBP: 0.79,
  SEK: 10.5,
  CHF: 0.88,
  HKD: 7.8,
  JPY: 150,
  AUD: 1.53,
  MYR: 4.45,
  PHP: 58.8,
  VND: 25_400,
  KRW: 1_390,
  TWD: 32.4,
  CNY: 7.12,
  INR: 84.4,
} as const

export const FIXED_USDC_EURC_RATE = FIXED_USD_RATES.EUR

export function fixedUsdRateLabel(currency: keyof typeof FIXED_USD_RATES): string {
  const rate = FIXED_USD_RATES[currency]
  const formatted = currency === "IDR" || currency === "JPY" ? rate.toLocaleString("en-US") : String(rate)
  return `1 USD = ${formatted} ${currency}`
}
