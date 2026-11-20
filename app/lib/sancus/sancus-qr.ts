// Sancus QR: "scan to pay me" codes between Sancus accounts, anywhere in the world.
// A code is a link, https://<app>/qr?pay=<token>, so a phone's own camera can open it too.
// The token names who gets paid (a person's personal balance, or a company / branch) and, optionally,
// a fixed amount in the receiver's currency. It's HMAC-signed so nobody can swap in their own wallet.
//
// Kept as short as possible so the QR stays sparse and scans easily from a phone: ids are packed to
// 16 raw bytes, the receiver's name isn't in the token (the server looks it up), and the signature is
// a 128-bit truncated HMAC-SHA256.
// Server only. The browser-side parser is in sancus-qr-parse.ts.
import { createHmac, timingSafeEqual } from "node:crypto"

export type SancusQrCurrency = "USD" | "THB" | "IDR" | "BRL"
export const SANCUS_QR_CURRENCIES: SancusQrCurrency[] = ["USD", "THB", "IDR", "BRL"]

export type SancusQrPayload = {
  /** Receiver user id */
  u: string
  /** Receiver company / branch id, or null for a personal balance */
  c: string | null
  /** Currency the receiver asked in */
  cur: SancusQrCurrency
  /** Fixed amount in `cur`, if the receiver set one */
  amt?: number
  /** Note shown to the payer */
  note?: string
  /** Issued at (ms); codes with an amount expire after a day */
  iat: number
}

/** On-the-wire form: short keys, packed ids, seconds. */
type Wire = { v: 2; u: string; c?: string; k: number; a?: number; m?: string; t: number }

const AMOUNT_CODE_TTL_MS = 24 * 60 * 60 * 1000
const SIG_BYTES = 16

function secret(): string {
  const s = process.env.SANCUS_QR_SECRET?.trim() || process.env.AGENT_PROPOSAL_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim()
  if (!s) throw new Error("Set SANCUS_QR_SECRET to sign Sancus QR codes")
  return s
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest().subarray(0, SIG_BYTES).toString("base64url")

const packId = (uuid: string) => Buffer.from(uuid.replace(/-/g, ""), "hex").toString("base64url")
function unpackId(b64: string): string | null {
  const hex = Buffer.from(b64, "base64url").toString("hex")
  if (hex.length !== 32) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function signSancusQr(payload: Omit<SancusQrPayload, "iat">, now = Date.now()): string {
  const wire: Wire = { v: 2, u: packId(payload.u), k: SANCUS_QR_CURRENCIES.indexOf(payload.cur), t: Math.floor(now / 1000) }
  if (payload.c) wire.c = packId(payload.c)
  if (payload.amt != null) wire.a = payload.amt
  if (payload.note) wire.m = payload.note
  const body = Buffer.from(JSON.stringify(wire), "utf8").toString("base64url")
  return `${body}.${sign(body)}`
}

export function verifySancusQr(token: string, now = Date.now()): { ok: true; payload: SancusQrPayload } | { ok: false; error: string } {
  const [body, mac] = token.trim().split(".")
  if (!body || !mac) return { ok: false, error: "That isn't a Sancus code" }
  const expected = Buffer.from(sign(body))
  const got = Buffer.from(mac)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, error: "This code has been changed or isn't from Sancus" }
  let wire: Wire
  try {
    wire = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Wire
  } catch {
    return { ok: false, error: "That isn't a Sancus code" }
  }
  const u = wire?.v === 2 ? unpackId(wire.u) : null
  const cur = SANCUS_QR_CURRENCIES[wire?.k]
  if (!u || !cur) return { ok: false, error: "That isn't a Sancus code. Ask for a new one." }
  const c = wire.c ? unpackId(wire.c) : null
  const payload: SancusQrPayload = { u, c, cur, amt: wire.a, note: wire.m, iat: wire.t * 1000 }
  if (payload.amt != null && now - payload.iat > AMOUNT_CODE_TTL_MS) return { ok: false, error: "This payment code has expired. Ask for a new one." }
  return { ok: true, payload }
}
