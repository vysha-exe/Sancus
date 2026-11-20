// Sancus NFC card-pay protocol (hackathon PoC).
// Real Android NFC radios; settlement is still Sancus virtual-card authorize/settle — not Visa/MC SoftPOS.
//
// Phone A (payer) hosts a short-lived signed NDEF payload (via the Android HCE companion, or a writable tag).
// Phone B (merchant) reads it with Chrome Web NFC and posts it to /api/sancus/nfc/charge.

import { createHmac, timingSafeEqual } from "node:crypto"

export { NFC_RECORD_TYPE, nfcDeepLink } from "@/lib/sancus/nfc-card-client"

export type SancusNfcCardPay = {
  v: 1
  kind: "card_pay"
  cardId: string
  lastFour: string
  /** USD the payer approved, or null to pay whatever the receiver asks (within the card's limits). */
  amount: number | null
  merchantName: string
  payerName: string
  userId: string
  exp: number
}

function nfcSecret(): string {
  return (
    process.env.SANCUS_NFC_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  )
}

export function nfcSigningConfigured(): boolean {
  return Boolean(nfcSecret())
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf
  return b.toString("base64url")
}

function signBody(body: string): string {
  const secret = nfcSecret()
  if (!secret) throw new Error("NFC signing isn't configured")
  return createHmac("sha256", secret).update(body).digest("base64url")
}

/** Server-only: produce a compact signed token for NDEF. */
export function signNfcCardPay(payload: SancusNfcCardPay): string {
  const body = b64url(JSON.stringify(payload))
  return `${body}.${signBody(body)}`
}

/** Server-only: verify and parse. */
export function verifyNfcCardPay(token: string): SancusNfcCardPay {
  const [body, sig] = token.split(".")
  if (!body || !sig) throw new Error("Invalid NFC payload")
  const expected = signBody(body)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("NFC payload signature mismatch")
  let parsed: SancusNfcCardPay
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SancusNfcCardPay
  } catch {
    throw new Error("NFC payload isn't valid JSON")
  }
  if (parsed?.v !== 1 || parsed.kind !== "card_pay") throw new Error("Unsupported NFC payload")
  if (!parsed.cardId) throw new Error("NFC payload missing card")
  if (parsed.amount != null && !(parsed.amount > 0)) throw new Error("NFC payload has an invalid amount")
  if (Date.now() > parsed.exp) throw new Error("This tap expired — ask the payer to tap again")
  return parsed
}

