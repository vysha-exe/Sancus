"use client"

// Pay › Scan a QR: point the camera at (or upload) a PromptPay, Pix or QRIS code and pay it
// from your USDC balance at the live rate. PromptPay goes out through
// Xendit, Pix through Payzu. Built for personal accounts; business accounts can use it too.
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { QrScanner } from "@/components/sancus-ui/qr-scanner"
import { parseSancusQrUrl } from "@/lib/sancus/sancus-qr-parse"
import {
  buildPaymentQr,
  parsePaymentQr,
  promptPayMobileDigits,
  SCHEME_LABEL,
  type ParsedQr,
} from "@/lib/sancus/emv-qr"

const SAMPLES: { label: string; payload: string }[] = [
  { label: "Street food stall (PromptPay, any amount)", payload: buildPaymentQr({ scheme: "PROMPTPAY", proxy: "0066898765432", proxyKind: "MOBILE", name: "JAY FAI NOODLES", city: "BANGKOK" }) },
  { label: "Bangkok café (PromptPay, ฿250)", payload: buildPaymentQr({ scheme: "PROMPTPAY", proxy: "0066812345678", proxyKind: "MOBILE", name: "BANGKOK CAFE", city: "BANGKOK", amount: "250.00" }) },
  { label: "São Paulo shop (Pix, R$50)", payload: buildPaymentQr({ scheme: "PIX", proxy: "loja@example.com", name: "LOJA PAULISTA", city: "SAO PAULO", amount: "50.00" }) },
  { label: "Jakarta warung (QRIS)", payload: buildPaymentQr({ scheme: "QRIS", proxy: "ID1020012345678", name: "WARUNG BU SRI", city: "JAKARTA", amount: "45000" }) },
]

const SYMBOL: Record<string, string> = { THB: "฿", BRL: "R$", IDR: "Rp", USD: "$" }
/** The pay-quote rail and currency for a scanned code we can pay. */
const QUOTE_RAIL: Partial<Record<ParsedQr["scheme"], { rail: string; currency: string }>> = {
  PROMPTPAY: { rail: "PromptPay", currency: "THB" },
  PIX: { rail: "Pix", currency: "BRL" },
}

function mask(v: string) {
  return v.length <= 4 ? v : `${"•".repeat(4)}${v.slice(-4)}`
}

type Result = { ok: true; message: string } | { ok: false; message: string }

export default function PayScanPageWrapper() {
  return (
    <Suspense fallback={<div className="page" />}>
      <PayScanPage />
    </Suspense>
  )
}

function PayScanPage() {
  const router = useRouter()
  const params = useSearchParams()
  const [text, setText] = useState("")
  const [qr, setQr] = useState<ParsedQr | null>(null)
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const key = useRef<string | null>(null)

  const load = useCallback((payload: string) => {
    // A Sancus person-to-person code belongs on Pay with QR.
    const sancus = parseSancusQrUrl(payload)
    if (sancus) return router.push(`/qr?pay=${encodeURIComponent(sancus)}`)
    const parsed = parsePaymentQr(payload)
    setText(payload)
    setQr(parsed)
    setAmount(parsed.amount ?? "")
    setResult(null)
    key.current = null
  }, [router])

  // Handed over from Pay with QR (?code=000201…).
  const handed = params.get("code")
  useEffect(() => {
    if (!handed) return
    const t = setTimeout(() => load(handed), 0)
    return () => clearTimeout(t)
  }, [handed, load])

  // Live quote: what the payee gets locally vs what leaves your balance in USDC.
  useEffect(() => {
    const t = setTimeout(async () => {
      setQuote(null)
      const q = qr ? QUOTE_RAIL[qr.scheme] : undefined
      if (!q || !(Number(amount) > 0)) return
      const res = await fetch("/api/sancus/pay/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rail: q.rail, currency: q.currency, side: "receive", amount: String(Number(amount)) }),
      }).catch(() => null)
      const body = await res?.json().catch(() => null)
      if (body?.quote) setQuote(`${body.quote.sendLabel} USDC from your balance · ${body.quote.rateLabel}`)
    }, 350)
    return () => clearTimeout(t)
  }, [qr, amount])

  async function pay() {
    if (!qr) return
    const value = Number(amount)
    if (!(value > 0)) return setResult({ ok: false, message: "Enter an amount." })
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setResult(null)
    try {
      let res: Response
      if (qr.scheme === "PROMPTPAY" && qr.proxy) {
        const digits = qr.proxy.type === "MOBILE" ? promptPayMobileDigits(qr.proxy.value) : qr.proxy.value.replace(/\D/g, "")
        res = await fetch("/api/sancus/xendit/payouts", {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": key.current },
          body: JSON.stringify({
            purpose: "SUPPLIER_PAYMENT",
            rail: "PROMPTPAY",
            recipientName: qr.merchantName ?? "PromptPay payee",
            accountNumber: digits,
            routingType: qr.proxy.type === "NATIONAL_ID" ? "NATIONAL_ID" : "MOBILE_NO",
            routingValue: digits,
            amount: value,
            description: "QR payment",
          }),
        })
      } else if (qr.scheme === "PIX") {
        res = await fetch("/api/sancus/pix/payments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ purpose: "SUPPLIER_PAYMENT", recipientName: qr.merchantName ?? "Pix payee", amountBrl: value, qrPayload: qr.raw, description: "QR payment" }),
        })
      } else {
        setResult({
          ok: false,
          message: qr.scheme === "PAYNOW" ? "Singapore PayNow codes aren't supported." : "Paying QRIS codes isn't available yet. Ask the merchant for bank details instead.",
        })
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResult({ ok: false, message: body.error ?? `Payment failed (${res.status})` })
        key.current = null
        return
      }
      const sym = SYMBOL[qr.currency ?? ""] ?? ""
      setResult({ ok: true, message: `Paid ${sym}${value.toFixed(2)} to ${qr.merchantName ?? "the payee"}. It's in your activity.` })
    } catch {
      setResult({ ok: false, message: "Network error. Try again." })
      key.current = null
    } finally {
      setBusy(false)
    }
  }

  const fixedAmount = Boolean(qr?.amount)
  const sym = SYMBOL[qr?.currency ?? ""] ?? ""

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          <Link href="/pay" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>
            ← Pay
          </Link>
          <h1 className="sx-h heading-2">Scan a QR code</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            PromptPay and Pix codes are paid from your USDC balance, converted at the live rate.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-label="Scan">
          <QrScanner onResult={load} autoStart={!handed} hint="Point your camera at a PromptPay or Pix code" />

          <label className="sx-field" style={{ marginTop: 16 }}>
            <span className="sx-label">Or paste the QR text</span>
            <textarea className="sx-field__input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="000201010211…" />
          </label>
          <button type="button" className="sx-btn sx-btn--quiet" onClick={() => text.trim() && load(text)}>
            Read code
          </button>

          <div style={{ marginTop: 16 }}>
            <span className="sx-label">No code handy? Try a sample</span>
            <div className="filters" style={{ marginTop: 6 }}>
              {SAMPLES.map((s) => (
                <button key={s.label} type="button" className="chip" onClick={() => load(s.payload)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="tile s5" aria-label="Payment">
          {!qr ? (
            <span className="body-s muted">Scan or upload a code to see who you&apos;re paying.</span>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              <span className="sx-label">{SCHEME_LABEL[qr.scheme]}</span>
              <h2 className="sx-h heading-3" style={{ margin: 0 }}>
                {qr.merchantName ?? "Unknown payee"}
              </h2>
              <span className="body-s muted">
                {[qr.city, qr.proxy ? `${qr.proxy.type.replace("_", " ").toLowerCase()} ${mask(qr.proxy.value)}` : null].filter(Boolean).join(" · ")}
              </span>
              {qr.scheme === "UNKNOWN" ? (
                <span className="body-s">This isn&apos;t a payment code we can read.</span>
              ) : (
                <>
                  <label className="sx-field" style={{ margin: 0 }}>
                    <span className="sx-label">Amount{qr.currency ? ` (${qr.currency})` : ""}</span>
                    <input
                      className="sx-field__input"
                      inputMode="decimal"
                      value={amount}
                      readOnly={fixedAmount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0.00"
                    />
                  </label>
                  {fixedAmount ? <span className="body-s muted">Amount set by the merchant.</span> : null}
                  {quote ? <span className="body-s">{quote}</span> : null}
                  {!qr.crcValid ? <span className="body-s muted">Checksum doesn&apos;t match: double-check the payee before paying.</span> : null}
                  <button type="button" className="sx-btn sx-btn--primary" disabled={busy || !(Number(amount) > 0) || Boolean(result?.ok)} onClick={pay}>
                    {busy ? "Paying…" : `Pay ${sym}${Number(amount) > 0 ? Number(amount).toFixed(2) : ""}`}
                  </button>
                </>
              )}
              {result ? (
                <div role="status" className="body-s" style={{ color: result.ok ? "var(--sx-success, #2a7)" : "var(--sx-danger, #c33)" }}>
                  {result.message} {result.ok ? <Link href="/activity">View activity</Link> : null}
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
