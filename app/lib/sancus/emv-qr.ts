// Sancus: reads payment QR codes (EMVCo merchant-presented format) used across the region:
//   PayNow (Singapore), PromptPay (Thailand), QRIS (Indonesia) and Pix (Brazil).
// Pure, runs in the browser and on the server. Also builds sample codes (with a valid CRC) for demos.

export type QrScheme = "PAYNOW" | "PROMPTPAY" | "QRIS" | "PIX" | "UNKNOWN"

export type ParsedQr = {
  scheme: QrScheme
  merchantName: string | null
  city: string | null
  country: string | null
  /** ISO 4217 letters, from tag 53 */
  currency: string | null
  /** Fixed amount in the QR, if the payee set one */
  amount: string | null
  /** Who gets paid */
  proxy: { type: "MOBILE" | "UEN" | "NATIONAL_ID" | "EWALLET" | "PIX_KEY" | "MERCHANT"; value: string } | null
  crcValid: boolean
  raw: string
}

const CURRENCY: Record<string, string> = { "702": "SGD", "764": "THB", "360": "IDR", "986": "BRL", "840": "USD" }
const NUMERIC: Record<string, string> = Object.fromEntries(Object.entries(CURRENCY).map(([n, a]) => [a, n]))

/** Splits an EMVCo string into tag → value. */
export function parseTlv(s: string): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2)
    const len = Number(s.slice(i + 2, i + 4))
    if (!Number.isInteger(len) || len < 0 || i + 4 + len > s.length) break
    out.set(tag, s.slice(i + 4, i + 4 + len))
    i += 4 + len
  }
  return out
}

/** CRC-16/CCITT-FALSE, as EMVCo QR uses (tag 63). */
export function crc16(s: string): string {
  let crc = 0xffff
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

export function parsePaymentQr(input: string): ParsedQr {
  const raw = input.trim()
  const tags = parseTlv(raw)
  const crcAt = raw.lastIndexOf("6304")
  const crcValid = crcAt >= 0 && raw.length === crcAt + 8 && crc16(raw.slice(0, crcAt + 4)) === raw.slice(crcAt + 4).toUpperCase()

  let scheme: QrScheme = "UNKNOWN"
  let proxy: ParsedQr["proxy"] = null
  for (let t = 26; t <= 51; t++) {
    const v = tags.get(String(t))
    if (!v) continue
    const sub = parseTlv(v)
    const guid = (sub.get("00") ?? "").toUpperCase()
    if (guid === "SG.PAYNOW") {
      scheme = "PAYNOW"
      const type = sub.get("01")
      const value = sub.get("02") ?? ""
      proxy = { type: type === "2" ? "UEN" : "MOBILE", value }
      break
    }
    if (guid === "A000000677010111" || guid === "A000000677010112") {
      scheme = "PROMPTPAY"
      if (sub.get("01")) proxy = { type: "MOBILE", value: sub.get("01")! }
      else if (sub.get("02")) proxy = { type: "NATIONAL_ID", value: sub.get("02")! }
      else if (sub.get("03")) proxy = { type: "EWALLET", value: sub.get("03")! }
      break
    }
    if (guid === "BR.GOV.BCB.PIX") {
      scheme = "PIX"
      if (sub.get("01")) proxy = { type: "PIX_KEY", value: sub.get("01")! }
      break
    }
    if (guid.startsWith("ID.CO.QRIS") || guid.startsWith("ID.CO.")) {
      scheme = "QRIS"
      proxy = { type: "MERCHANT", value: sub.get("02") ?? sub.get("01") ?? "" }
      break
    }
  }

  return {
    scheme,
    merchantName: tags.get("59")?.trim() || null,
    city: tags.get("60")?.trim() || null,
    country: tags.get("58") ?? null,
    currency: CURRENCY[tags.get("53") ?? ""] ?? null,
    amount: tags.get("54") ?? null,
    proxy,
    crcValid,
    raw,
  }
}

/** PromptPay mobile "0066812345678" → "66812345678" (Xendit wants digits only, country code first). */
export function promptPayMobileDigits(value: string): string {
  const d = value.replace(/\D/g, "")
  if (d.startsWith("0066")) return d.slice(2)
  if (d.startsWith("66")) return d
  if (d.startsWith("0")) return `66${d.slice(1)}`
  return d
}

/** PayNow mobile in a QR ("+6591234567" or "91234567") → "+6591234567". */
export function payNowMobile(value: string): string {
  const d = value.replace(/\D/g, "")
  if (d.length === 8) return `+65${d}`
  if (d.startsWith("65") && d.length === 10) return `+${d}`
  return value
}

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`
}

/** Builds a valid merchant-presented QR string (for sample codes in the demo). */
export function buildPaymentQr(opts: {
  scheme: Exclude<QrScheme, "UNKNOWN">
  proxy: string
  proxyKind?: "MOBILE" | "UEN" | "NATIONAL_ID"
  name: string
  city: string
  amount?: string
}): string {
  const map = {
    PAYNOW: { tag: "26", guid: "SG.PAYNOW", country: "SG", cur: "SGD", sub: tlv("01", opts.proxyKind === "UEN" ? "2" : "0") + tlv("02", opts.proxy) + tlv("03", "0") },
    PROMPTPAY: { tag: "29", guid: "A000000677010111", country: "TH", cur: "THB", sub: tlv(opts.proxyKind === "NATIONAL_ID" ? "02" : "01", opts.proxy) },
    PIX: { tag: "26", guid: "br.gov.bcb.pix", country: "BR", cur: "BRL", sub: tlv("01", opts.proxy) },
    QRIS: { tag: "26", guid: "ID.CO.QRIS.WWW", country: "ID", cur: "IDR", sub: tlv("02", opts.proxy) },
  }[opts.scheme]
  let body =
    tlv("00", "01") +
    tlv("01", opts.amount ? "12" : "11") +
    tlv(map.tag, tlv("00", map.guid) + map.sub) +
    tlv("52", "0000") +
    tlv("53", NUMERIC[map.cur]!) +
    (opts.amount ? tlv("54", opts.amount) : "") +
    tlv("58", map.country) +
    tlv("59", opts.name.slice(0, 25)) +
    tlv("60", opts.city.slice(0, 15))
  body += "6304"
  return body + crc16(body)
}

export const SCHEME_LABEL: Record<QrScheme, string> = {
  PAYNOW: "PayNow · Singapore",
  PROMPTPAY: "PromptPay · Thailand",
  QRIS: "QRIS · Indonesia",
  PIX: "Pix · Brazil",
  UNKNOWN: "Unknown QR",
}
