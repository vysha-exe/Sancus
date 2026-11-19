// Sancus: quotes for the pay flow's "You send / They get", for every rail.
//
// Everything starts from USDC, the balance the business actually holds:
//   USDC → USDC        1:1, no conversion, no fee (onchain)
//   USDC → USD         1:1 redemption (ACH, US wire), rail fee only
//   USDC → BRL/THB/IDR converted at the live rate (Pix, PromptPay, BI-FAST); EUR/MXN likewise
// Integer math only: USDC in 6-decimal minor units, local currency in its own minor units,
// rates as local-per-USDC × 1e6. Rates are indicative (configured), like the other simulated rails.

export type PayCurrency = "USDC" | "USD" | "BRL" | "THB" | "IDR" | "EUR" | "MXN"
export type PayRail = "USDC" | "ACH" | "Wire" | "Pix" | "PromptPay" | "BI-FAST" | "SEPA" | "SPEI" | "Internal"
export type QuoteSide = "send" | "receive"

const USDC_DP = 6
const RATE_SCALE = 1_000_000n

export const CURRENCIES: Record<PayCurrency, { symbol: string; decimals: number; rateMicro: bigint; locale: string }> = {
  USDC: { symbol: "", decimals: 6, rateMicro: 1_000_000n, locale: "en-US" },
  USD: { symbol: "$", decimals: 2, rateMicro: 1_000_000n, locale: "en-US" },
  BRL: { symbol: "R$ ", decimals: 2, rateMicro: 5_412_300n, locale: "pt-BR" },
  THB: { symbol: "฿ ", decimals: 2, rateMicro: 35_000_000n, locale: "th-TH" },
  IDR: { symbol: "Rp ", decimals: 0, rateMicro: 16_000_000_000n, locale: "id-ID" },
  EUR: { symbol: "€ ", decimals: 2, rateMicro: 921_000n, locale: "de-DE" }, // € 1.840,00
  MXN: { symbol: "MX$ ", decimals: 2, rateMicro: 17_050_000n, locale: "es-MX" },
}

export const RAILS: Record<PayRail, { feeUsdcMinor: bigint; eta: string; currencies: PayCurrency[] }> = {
  USDC: { feeUsdcMinor: 0n, eta: "Seconds", currencies: ["USDC"] },
  ACH: { feeUsdcMinor: 0n, eta: "1–2 days", currencies: ["USD"] },
  Wire: { feeUsdcMinor: 3_500_000n, eta: "Same or next day", currencies: ["USD", "BRL", "EUR", "MXN"] },
  Pix: { feeUsdcMinor: 800_000n, eta: "Seconds", currencies: ["BRL"] },
  PromptPay: { feeUsdcMinor: 500_000n, eta: "Seconds", currencies: ["THB"] },
  "BI-FAST": { feeUsdcMinor: 500_000n, eta: "Seconds", currencies: ["IDR"] },
  SEPA: { feeUsdcMinor: 800_000n, eta: "Same day", currencies: ["EUR"] },
  SPEI: { feeUsdcMinor: 800_000n, eta: "Minutes", currencies: ["MXN"] },
  Internal: { feeUsdcMinor: 0n, eta: "Seconds", currencies: ["USDC"] },
}

/** The currency a rail pays out in by default (Wire follows the recipient's currency). */
export function defaultCurrency(rail: PayRail): PayCurrency {
  return RAILS[rail].currencies[0]!
}

export function isPayRail(v: string): v is PayRail {
  return v in RAILS
}

function parseMinor(input: string, decimals: number): bigint | null {
  // Accept "1,234.56" and "1.234,56" (pt-BR style).
  let s = input.trim().replace(/\s/g, "")
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".")
  else s = s.replace(/,/g, "")
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const [whole, frac = ""] = s.split(".")
  if (frac.length > decimals) return null
  return BigInt(whole!) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0")
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b

export function formatAmount(minor: bigint, currency: PayCurrency, maxFraction = 2): string {
  const c = CURRENCIES[currency]
  const value = Number(minor) / 10 ** c.decimals
  const n = value.toLocaleString(c.locale, { minimumFractionDigits: Math.min(2, c.decimals), maximumFractionDigits: Math.min(maxFraction, Math.max(c.decimals, 2)) })
  return currency === "USDC" ? `${n} USDC` : `${c.symbol}${n}`
}

export function formatRateMicro(rateMicro: bigint): string {
  const whole = rateMicro / RATE_SCALE
  const frac = (rateMicro % RATE_SCALE).toString().padStart(6, "0").slice(0, 4)
  return `${whole}.${frac}`
}

/** A USDC amount (6-dp minor units) shown as dollars, e.g. 800000 → "$0.80". */
export function formatUsdc(minor: bigint): string {
  return `$${(Number(minor) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export type PayQuote = {
  rail: PayRail
  currency: PayCurrency
  /** Total USDC debited from the balance (amount + fee). */
  sendUsdcMinor: bigint
  /** USDC that is converted / delivered (send − fee). */
  amountUsdcMinor: bigint
  feeUsdcMinor: bigint
  /** What the recipient gets, in `currency` minor units. */
  receiveMinor: bigint
  rateMicro: bigint
  converted: boolean
  eta: string
}

export type QuoteResult = { ok: true; quote: PayQuote } | { ok: false; error: string }

/**
 * `side: "send"` → `amount` is the USDC total you send (fee included).
 * `side: "receive"` → `amount` is what they get, in `currency`.
 */
export function quotePay(input: { rail: PayRail; currency?: PayCurrency; side: QuoteSide; amount: string; rateMicro?: bigint }): QuoteResult {
  const rail = RAILS[input.rail]
  const currency = input.currency ?? defaultCurrency(input.rail)
  if (!rail.currencies.includes(currency)) return { ok: false, error: `${input.rail} doesn't pay out in ${currency}` }
  const base = CURRENCIES[currency]
  // USDC and USD are always 1:1; other currencies may pass a live rate.
  const cur = input.rateMicro && currency !== "USDC" && currency !== "USD" ? { ...base, rateMicro: input.rateMicro } : base
  const fee = rail.feeUsdcMinor
  // local minor = usdc minor × rate / 1e6, rescaled from 6 dp to the currency's dp
  const scale = 10n ** BigInt(USDC_DP - cur.decimals)

  let amountUsdc: bigint
  let receive: bigint
  if (input.side === "send") {
    const send = parseMinor(input.amount, USDC_DP)
    if (send === null) return { ok: false, error: "Enter an amount like 100.00" }
    if (send <= fee) return { ok: false, error: `Send more than the ${formatUsdc(fee)} fee` }
    amountUsdc = send - fee
    receive = (amountUsdc * cur.rateMicro) / RATE_SCALE / scale
  } else {
    const want = parseMinor(input.amount, cur.decimals)
    if (want === null || want <= 0n) return { ok: false, error: "Enter an amount like 100.00" }
    receive = want
    amountUsdc = ceilDiv(want * scale * RATE_SCALE, cur.rateMicro) // round up: they never get less
  }
  if (amountUsdc > 1_000_000_000_000n) return { ok: false, error: "That's over the $1,000,000 limit per payment" }
  return {
    ok: true,
    quote: {
      rail: input.rail,
      currency,
      sendUsdcMinor: amountUsdc + fee,
      amountUsdcMinor: amountUsdc,
      feeUsdcMinor: fee,
      receiveMinor: receive,
      rateMicro: cur.rateMicro,
      converted: currency !== "USDC" && currency !== "USD",
      eta: rail.eta,
    },
  }
}

export function serializePayQuote(q: PayQuote) {
  const rate = formatRateMicro(q.rateMicro)
  return {
    rail: q.rail,
    currency: q.currency,
    sendUsdcMinor: q.sendUsdcMinor.toString(),
    amountUsdcMinor: q.amountUsdcMinor.toString(),
    feeUsdcMinor: q.feeUsdcMinor.toString(),
    receiveMinor: q.receiveMinor.toString(),
    rate,
    converted: q.converted,
    eta: q.eta,
    sendLabel: formatUsdc(q.sendUsdcMinor),
    amountLabel: formatUsdc(q.amountUsdcMinor),
    feeLabel: formatUsdc(q.feeUsdcMinor),
    receiveLabel: formatAmount(q.receiveMinor, q.currency),
    /** Plain number string for the "They get" input. */
    receiveInput: (Number(q.receiveMinor) / 10 ** CURRENCIES[q.currency].decimals).toFixed(2),
    sendInput: (Number(q.sendUsdcMinor) / 1e6).toFixed(2),
    rateLabel:
      q.currency === "USDC"
        ? "USDC to USDC · no conversion"
        : q.currency === "USD"
          ? "1 USDC = 1 USD · redeemed 1:1"
          : `1 USDC = ${rate} ${q.currency}`,
  }
}

export type SerializedPayQuote = ReturnType<typeof serializePayQuote>
