// Sancus: payout route quotes sold to agents over x402.
// Singapore uses the same quoting as real Sancus payouts. Indonesia and Thailand
// are indicative (configured rates, simulated rails) until partners are live.

import { formatRate, quoteSgdPayout, RATE_SCALE, type FxConfig } from "./fx"
import { displayMinor, parseToMinor, USDC_DECIMALS } from "./money"
import { FIXED_USD_RATES } from "./fixed-rates"

export type Country = "SG" | "ID" | "TH"
export type RecipientType = "UEN" | "MOBILE" | "BANK"

type RailOption = { rail: string; feeMinor: bigint; eta: string; needs: RecipientType[] }

type Corridor = {
  country: Country
  currency: string
  symbol: string
  live: boolean
  defaultRate: string
  rails: RailOption[]
}

const CORRIDORS: Record<Country, Corridor> = {
  SG: {
    country: "SG",
    currency: "SGD",
    symbol: "S$",
    live: true,
    defaultRate: String(FIXED_USD_RATES.SGD),
    rails: [
      { rail: "PayNow", feeMinor: 50n, eta: "seconds", needs: ["UEN", "MOBILE"] },
      { rail: "FAST", feeMinor: 50n, eta: "seconds", needs: ["BANK"] },
    ],
  },
  ID: {
    country: "ID",
    currency: "IDR",
    symbol: "Rp",
    live: false,
    defaultRate: String(FIXED_USD_RATES.IDR),
    rails: [{ rail: "BI-FAST", feeMinor: 250_000n, eta: "seconds", needs: ["BANK", "MOBILE"] }],
  },
  TH: {
    country: "TH",
    currency: "THB",
    symbol: "฿",
    live: false,
    defaultRate: String(FIXED_USD_RATES.THB),
    rails: [{ rail: "PromptPay", feeMinor: 1_000n, eta: "seconds", needs: ["MOBILE", "BANK"] }],
  },
}

function rateConfig(c: Corridor, feeMinor: bigint): FxConfig {
  const midRateMicro = parseToMinor(c.defaultRate, 6) ?? RATE_SCALE
  return { midRateMicro, spreadBps: 0n, feeSgdMinor: { PAYNOW: feeMinor, FAST: feeMinor } }
}

export type RouteQuoteResult =
  | { ok: false; error: string }
  | {
      ok: true
      body: {
        corridor: Country
        currency: string
        amount: string
        recipientType: RecipientType
        best: RouteOption
        alternatives: RouteOption[]
        live: boolean
        quotedAt: string
        validForSeconds: null
        note: string
      }
    }

type RouteOption = {
  rail: string
  available: boolean
  reason: string
  fee: string
  rate: string
  usdcCost: string
  eta: string
  simulated: boolean
}

export function routeQuote(
  params: { country?: string | null; amount?: string | null; recipientType?: string | null },
  _env: Record<string, string | undefined> = process.env,
  now: Date = new Date()
): RouteQuoteResult {
  void _env // Kept in the signature for API compatibility; demo rates are fixed.
  const country = (params.country || "SG").toUpperCase() as Country
  const corridor = CORRIDORS[country]
  if (!corridor) return { ok: false, error: `Unsupported country "${params.country}". Use SG, ID or TH.` }

  const recipientType = (params.recipientType || "UEN").toUpperCase() as RecipientType
  if (!["UEN", "MOBILE", "BANK"].includes(recipientType)) {
    return { ok: false, error: "recipientType must be UEN, MOBILE or BANK" }
  }

  const amountMinor = parseToMinor(params.amount || "", 2)
  if (amountMinor === null || amountMinor <= 0n) {
    return { ok: false, error: `amount must be a positive ${corridor.currency} amount with up to 2 decimals` }
  }

  const options: RouteOption[] = corridor.rails.map((r) => {
    const cfg = rateConfig(corridor, r.feeMinor)
    const q = quoteSgdPayout(amountMinor, "PAYNOW", cfg, now)
    const available = r.needs.includes(recipientType)
    return {
      rail: r.rail,
      available,
      reason: available ? `${r.rail} accepts a ${recipientType.toLowerCase()} recipient` : `${r.rail} needs ${r.needs.join(" or ").toLowerCase()}`,
      fee: `${corridor.symbol}${displayMinor(r.feeMinor, 2, "", 2)}`,
      rate: `1 USD = ${formatRate(q.clientRateMicro)} ${corridor.currency}`,
      usdcCost: displayMinor(q.usdcAmountMinor, USDC_DECIMALS, "", 6),
      eta: r.eta,
      simulated: !corridor.live,
    }
  })

  const available = options
    .filter((o) => o.available)
    .sort((a, b) => Number(a.usdcCost.replace(/,/g, "")) - Number(b.usdcCost.replace(/,/g, "")))
  const best = available[0] ?? options[0]!

  return {
    ok: true,
    body: {
      corridor: country,
      currency: corridor.currency,
      amount: `${corridor.symbol}${displayMinor(amountMinor, 2, "", 2)}`,
      recipientType,
      best,
      alternatives: options.filter((o) => o !== best),
      live: corridor.live,
      quotedAt: now.toISOString(),
      validForSeconds: null,
      note: "Fixed hackathon demo rate; the payout rail remains simulated or testnet-backed.",
    },
  }
}

export { RATE_SCALE }
