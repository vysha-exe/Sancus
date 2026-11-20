// Sancus cross-rail pay (personal accounts): pay a vendor on rail B with money that comes in on rail A.
//
//   1. Pay-in   — the person pays on rail A (card, ACH, Pix, PromptPay, QRIS or their Sancus USDC balance)
//                 into the Sancus partner bank (or wallet) that speaks rail A.
//   2. Treasury — Sancus treasury nets it into USDC on Arc and converts to the vendor's currency (StableFX).
//   3. Payout   — the Sancus partner bank in the vendor's country pays the vendor on rail B.
//
// The demo mocks partner banks and most legs (labelled Simulated). Pure: runs in the browser and on the server.
// Reuses emv-qr.ts helpers without changing them; the terminal reference rides in EMV tag 62 / sub-tag 05.

import { buildPaymentQr, crc16, parsePaymentQr, parseTlv, type ParsedQr } from "./emv-qr"
import { FIXED_USD_RATES } from "./fixed-rates"

export type CountryCode = "US" | "BR" | "TH" | "ID"
export type VendorRail = "PIX" | "PROMPTPAY" | "QRIS" | "CARD"
export type SourceRail = VendorRail | "ACH" | "USDC"
export type Currency = "USD" | "BRL" | "THB" | "IDR" | "USDC"

export const COUNTRIES: Record<CountryCode, { name: string; currency: Currency; mainRail: VendorRail; partnerBank: string }> = {
  US: { name: "United States", currency: "USD", mainRail: "CARD", partnerBank: "JPMorgan Chase" },
  BR: { name: "Brazil", currency: "BRL", mainRail: "PIX", partnerBank: "Itaú Unibanco" },
  TH: { name: "Thailand", currency: "THB", mainRail: "PROMPTPAY", partnerBank: "Kasikornbank" },
  ID: { name: "Indonesia", currency: "IDR", mainRail: "QRIS", partnerBank: "Bank Central Asia" },
}

export const RAILS: Record<SourceRail, { label: string; network: string; feeUsd: number; speed: string; country: CountryCode | null }> = {
  PIX: { label: "Pix", network: "Banco Central do Brasil · SPI", feeUsd: 0.8, speed: "~3 s", country: "BR" },
  PROMPTPAY: { label: "PromptPay", network: "ITMX · PromptPay", feeUsd: 0.5, speed: "~5 s", country: "TH" },
  QRIS: { label: "QRIS", network: "Bank Indonesia · BI-FAST", feeUsd: 0.5, speed: "~5 s", country: "ID" },
  CARD: { label: "Card", network: "Visa", feeUsd: 0, speed: "Instant auth", country: "US" },
  ACH: { label: "ACH", network: "Nacha · same-day ACH", feeUsd: 0, speed: "Same day", country: "US" },
  USDC: { label: "USDC", network: "Arc testnet", feeUsd: 0, speed: "~1 s", country: null },
}

/** FX spread when the pay-in and payout currencies differ (StableFX on Arc). */
export const FX_SPREAD = 0.0035

// ---------- vendors (the "sandbox" side) ----------

export type Vendor = {
  id: string
  name: string
  /** Merchant name as it sits in the QR (EMV tag 59, max 25 chars, ASCII) */
  qrName: string
  qrCity: string
  city: string
  country: CountryCode
  rail: VendorRail
  category: string
  initials: string
  /** Pix key / PromptPay mobile / QRIS merchant id. Not used by CARD vendors. */
  proxy: string
  proxyKind?: "MOBILE"
  /** Amount the terminal starts with, in the vendor's currency */
  sampleAmount: string
  /** Terminal id shown on the receipt */
  terminalId: string
}

export const VENDORS: Vendor[] = [
  {
    id: "casa-ribeiro",
    name: "Casa Ribeiro Cafés Ltda.",
    qrName: "CASA RIBEIRO CAFES",
    qrCity: "SAO PAULO",
    city: "São Paulo, Brazil",
    country: "BR",
    rail: "PIX",
    category: "Coffee roaster & café",
    initials: "CR",
    proxy: "financeiro@casaribeiro.example",
    sampleAmount: "86.50",
    terminalId: "SP-0142",
  },
  {
    id: "chao-phraya-print",
    name: "Chao Phraya Print House",
    qrName: "CHAO PHRAYA PRINT HOUSE",
    qrCity: "BANGKOK",
    city: "Bangkok, Thailand",
    country: "TH",
    rail: "PROMPTPAY",
    category: "Print & signage",
    initials: "CP",
    proxy: "0066821234567",
    proxyKind: "MOBILE",
    sampleAmount: "1250.00",
    terminalId: "BK-0388",
  },
  {
    id: "arunika-kopi",
    name: "PT Arunika Kopi Nusantara",
    qrName: "ARUNIKA KOPI NUSANTARA",
    qrCity: "JAKARTA",
    city: "Jakarta, Indonesia",
    country: "ID",
    rail: "QRIS",
    category: "Coffee & roastery",
    initials: "AK",
    proxy: "ID1020045678901",
    sampleAmount: "185000",
    terminalId: "JK-0217",
  },
  {
    id: "harbor-pine",
    name: "Harbor & Pine Supply Co.",
    qrName: "HARBOR AND PINE SUPPLY",
    qrCity: "SEATTLE",
    city: "Seattle, United States",
    country: "US",
    rail: "CARD",
    category: "Hardware & workshop supply",
    initials: "HP",
    proxy: "",
    sampleAmount: "64.20",
    terminalId: "SEA-0031",
  },
]

export const vendorById = (id: string) => VENDORS.find((v) => v.id === id) ?? null

/** Best match for a scanned code: same rail and same proxy (or name), so richer details can be shown. */
export function vendorForQr(qr: ParsedQr): Vendor | null {
  const rail = qr.scheme === "PIX" || qr.scheme === "PROMPTPAY" || qr.scheme === "QRIS" ? qr.scheme : null
  if (!rail) return null
  return VENDORS.find((v) => v.rail === rail && (v.proxy === qr.proxy?.value || v.qrName === qr.merchantName)) ?? null
}

export const vendorCurrency = (v: Pick<Vendor, "country">): Currency => COUNTRIES[v.country].currency

// ---------- funding sources (rail A) ----------

export type FundingSource = {
  id: string
  rail: SourceRail
  label: string
  detail: string
  currency: Currency
  /** Where the money sits (null for the Sancus USDC balance) */
  country: CountryCode | null
}

/** The person's ways to pay. Linked foreign accounts are mocked for the demo. */
export const FUNDING_SOURCES: FundingSource[] = [
  { id: "card", rail: "CARD", label: "Visa credit •••• 4242", detail: "Card on file", currency: "USD", country: "US" },
  { id: "ach", rail: "ACH", label: "Chase checking", detail: "US bank · ACH", currency: "USD", country: "US" },
  { id: "usdc", rail: "USDC", label: "Sancus balance", detail: "USDC on Arc", currency: "USDC", country: null },
  { id: "pix", rail: "PIX", label: "Nubank", detail: "Brazilian account · Pix", currency: "BRL", country: "BR" },
  { id: "promptpay", rail: "PROMPTPAY", label: "Siam Commercial Bank", detail: "Thai account · PromptPay", currency: "THB", country: "TH" },
  { id: "qris", rail: "QRIS", label: "GoPay", detail: "Indonesian e-wallet · QRIS", currency: "IDR", country: "ID" },
]

export const sourceById = (id: string) => FUNDING_SOURCES.find((s) => s.id === id) ?? FUNDING_SOURCES[0]

/** Default rail A: the main rail of the payer's home country. */
export function defaultSourceFor(home: CountryCode): FundingSource {
  const rail = COUNTRIES[home].mainRail
  return FUNDING_SOURCES.find((s) => s.rail === rail) ?? FUNDING_SOURCES[0]
}

/** Who receives rail-A money on the Sancus side. */
export function payInParty(source: FundingSource): string {
  if (source.rail === "USDC") return "Sancus wallet"
  return `${COUNTRIES[source.country ?? "US"].partnerBank} (partner)`
}

// ---------- quote ----------

const rate = (c: Currency) => (c === "USDC" ? 1 : FIXED_USD_RATES[c])

export type CrossRailQuote = {
  vendorAmount: number
  vendorCurrency: Currency
  sourceAmount: number
  sourceCurrency: Currency
  /** USD value of what the vendor receives */
  usd: number
  feesUsd: number
  fxUsd: number
  needsFx: boolean
  rateLabel: string
}

export function quoteCrossRail(vendor: Vendor, amount: number, source: FundingSource): CrossRailQuote {
  const vCur = vendorCurrency(vendor)
  const usd = amount / rate(vCur)
  const same = (a: Currency, b: Currency) => a === b || (a === "USDC" && b === "USD") || (a === "USD" && b === "USDC")
  const needsFx = !same(source.currency, vCur)
  const fxUsd = needsFx ? usd * FX_SPREAD : 0
  const sameRail = source.rail === vendor.rail
  const feesUsd = RAILS[source.rail].feeUsd + (sameRail ? 0 : RAILS[vendor.rail].feeUsd)
  const totalUsd = usd + fxUsd + feesUsd
  const sourceAmount = totalUsd * rate(source.currency)
  const rateLabel = needsFx ? `1 ${source.currency} = ${fmtRate(rate(vCur) / rate(source.currency))} ${vCur}` : "No conversion"
  return { vendorAmount: amount, vendorCurrency: vCur, sourceAmount, sourceCurrency: source.currency, usd, feesUsd, fxUsd, needsFx, rateLabel }
}

function fmtRate(n: number) {
  if (n >= 100) return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 })
  return n.toPrecision(4)
}

export function formatMoney(amount: number, currency: Currency): string {
  if (currency === "USDC") return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
  const digits = currency === "IDR" ? 0 : 2
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : currency === "THB" ? "th-TH" : currency === "IDR" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount)
}

// ---------- route ----------

export type RouteLeg = {
  key: "payin" | "treasury" | "payout" | "vendor"
  title: string
  from: string
  to: string
  rail: string
  detail: string
  /** How long the demo animation spends on this leg */
  ms: number
}

export function routeLegs(vendor: Vendor, source: FundingSource, q: CrossRailQuote): RouteLeg[] {
  const payoutBank = COUNTRIES[vendor.country].partnerBank
  const inRail = RAILS[source.rail]
  return [
    {
      key: "payin",
      title: `Pay in by ${inRail.label}`,
      from: `${source.label}`,
      to: payInParty(source),
      rail: inRail.label,
      detail: `${formatMoney(q.sourceAmount, q.sourceCurrency)} over ${inRail.network}`,
      ms: 1300,
    },
    {
      key: "treasury",
      title: q.needsFx ? "Convert in the Sancus treasury" : "Route through the Sancus treasury",
      from: payInParty(source),
      to: "Sancus treasury · Arc",
      rail: q.needsFx ? "StableFX" : "USDC",
      detail: q.needsFx ? `${q.sourceCurrency} → USDC → ${q.vendorCurrency} · ${q.rateLabel}` : `Settled as USDC, no conversion`,
      ms: 1500,
    },
    {
      key: "payout",
      title: `Pay out by ${RAILS[vendor.rail].label}`,
      from: `${payoutBank} (partner)`,
      to: vendor.name,
      rail: RAILS[vendor.rail].label,
      detail: `${formatMoney(q.vendorAmount, q.vendorCurrency)} over ${RAILS[vendor.rail].network}`,
      ms: 1400,
    },
    {
      key: "vendor",
      title: vendor.rail === "CARD" ? "Terminal approved" : "Vendor confirmed",
      from: vendor.name,
      to: vendor.terminalId,
      rail: "Receipt",
      detail: `${vendor.city}`,
      ms: 700,
    },
  ]
}

/** Deterministic-looking settlement reference per rail, e.g. Pix end-to-end id. */
export function settlementRef(rail: SourceRail, seed: string): string {
  const s = seed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().padEnd(16, "0")
  if (rail === "PIX") return `E60701190${s.slice(0, 12)}`
  if (rail === "PROMPTPAY") return `PP${s.slice(0, 14)}`
  if (rail === "QRIS") return `QR${s.slice(0, 14)}`
  if (rail === "CARD") return `AUTH ${s.slice(0, 6)}`
  if (rail === "ACH") return `ACH${s.slice(0, 12)}`
  return `0x${s.toLowerCase().slice(0, 16)}`
}

// ---------- terminal references in codes ----------

/** Adds EMV tag 62 / sub-tag 05 (reference label) to a merchant QR and fixes the CRC. */
export function withReference(payload: string, ref: string): string {
  const crcAt = payload.lastIndexOf("6304")
  const body = crcAt >= 0 ? payload.slice(0, crcAt) : payload
  const sub = `05${String(ref.length).padStart(2, "0")}${ref}`
  const add = `62${String(sub.length).padStart(2, "0")}${sub}6304`
  return body + add + crc16(body + add)
}

export function readReference(payload: string): string | null {
  const add = parseTlv(payload.trim()).get("62")
  return add ? (parseTlv(add).get("05") ?? null) : null
}

/** A vendor terminal's code for an amount (QR rails only). */
export function vendorQr(vendor: Vendor, amount: string, ref: string): string {
  if (vendor.rail === "CARD") throw new Error("Card terminals don't show a merchant QR")
  const base = buildPaymentQr({
    scheme: vendor.rail,
    proxy: vendor.proxy,
    proxyKind: vendor.proxyKind,
    name: vendor.qrName,
    city: vendor.qrCity,
    amount,
  })
  return withReference(base, ref)
}

/** Card terminals: what the phone "taps" (a link, so a phone camera can open it too). */
export type PosCode = { v: 1; t: string; m: string; a: string }

export const PERSONAL_SCAN_PATH = "/pay/scan-personal"

export function posUrl(origin: string, code: Omit<PosCode, "v">): string {
  const json = JSON.stringify({ v: 1, ...code })
  const b64 = typeof btoa === "function" ? btoa(json) : Buffer.from(json).toString("base64")
  return `${origin}${PERSONAL_SCAN_PATH}?pos=${b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

export function parsePos(value: string): PosCode | null {
  try {
    let token = value.trim()
    if (token.includes("pos=")) token = new URL(token, "https://x.invalid").searchParams.get("pos") ?? ""
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/")
    const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8")
    const pos = JSON.parse(json) as PosCode
    return pos?.v === 1 && vendorById(pos.m) && Number(pos.a) > 0 && typeof pos.t === "string" ? pos : null
  } catch {
    return null
  }
}

/** True for anything the personal scan screen can pay: an EMV merchant QR or a Sancus card-terminal link. */
export function isCrossRailCode(text: string): boolean {
  const t = text.trim()
  return /^000201/.test(t) || (t.includes(`${PERSONAL_SCAN_PATH}?pos=`) && parsePos(t) !== null)
}

export function newTerminalRef(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return `SX${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").toUpperCase().slice(0, 10)}`
}

export { parsePaymentQr }
