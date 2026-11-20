// Sancus QR: "scan to pay me" codes between Sancus accounts, anywhere in the world.
// A code is a link, https://<app>/qr?pay=<token>, so a phone's own camera can open it too.
// The token names who gets paid (a person's personal balance, or a company / branch) and, optionally,
// a fixed amount in the receiver's currency. It's HMAC-signed so nobody can swap in their own wallet.
// Server only. The browser-side parser is in sancus-qr-parse.ts.
import { createHmac, timingSafeEqual } from "node:crypto"

export type SancusQrCurrency = "USD" | "THB" | "IDR" | "BRL"
export const SANCUS_QR_CURRENCIES: SancusQrCurrency[] = ["USD", "THB", "IDR", "BRL"]

export type SancusQrPayload = {
  v: 1
  /** Receiver user id */
  u: string
  /** Receiver company / branch id, or null for a personal balance */
  c: string | null
  /** Display name shown to the payer */
  n: string
  /** Currency the receiver asked in */
  cur: SancusQrCurrency
  /** Fixed amount in `cur`, if the receiver set one */
  amt?: number
  /** Note shown to the payer */
  note?: string
  /** Issued at (ms); codes with an amount expire after a day */
  iat: number
}

const AMOUNT_CODE_TTL_MS = 24 * 60 * 60 * 1000

function secret(): string {
  const s = process.env.SANCUS_QR_SECRET?.trim() || process.env.AGENT_PROPOSAL_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()
  if (!s) throw new Error("Set SANCUS_QR_SECRET to sign Sancus QR codes")
  return s
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url")
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url")

export function signSancusQr(payload: Omit<SancusQrPayload, "v" | "iat">, now = Date.now()): string {
  const body = b64(JSON.stringify({ v: 1, iat: now, ...payload }))
  return `${body}.${sign(body)}`
}

export function verifySancusQr(token: string, now = Date.now()): { ok: true; payload: SancusQrPayload } | { ok: false; error: string } {
  const [body, mac] = token.trim().split(".")
  if (!body || !mac) return { ok: false, error: "That isn't a Sancus code" }
  const expected = Buffer.from(sign(body))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, error: "This code has been changed or isn't from Sancus" }
  let payload: SancusQrPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SancusQrPayload
  } catch {
    return { ok: false, error: "That isn't a Sancus code" }
  }
  if (payload.v !== 1 || !payload.u || !SANCUS_QR_CURRENCIES.includes(payload.cur)) return { ok: false, error: "That isn't a Sancus code" }
  if (payload.amt != null && now - payload.iat > AMOUNT_CODE_TTL_MS) return { ok: false, error: "This payment code has expired. Ask for a new one." }
  return { ok: true, payload }
}
