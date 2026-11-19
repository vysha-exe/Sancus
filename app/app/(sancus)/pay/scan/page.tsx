"use client"

// Pay › Scan a QR: point the camera at (or upload) a PayNow, PromptPay, Pix or QRIS code and pay it
// from your USDC balance. PayNow goes out through the live Singapore payout rail, PromptPay through
// Xendit, Pix through Payzu. Built for personal accounts; business accounts can use it too.
import jsQR from "jsqr"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildPaymentQr,
  parsePaymentQr,
  payNowMobile,
  promptPayMobileDigits,
  SCHEME_LABEL,
  type ParsedQr,
} from "@/lib/sancus/emv-qr"

const SAMPLES: { label: string; payload: string }[] = [
  { label: "Kopi & Co. (PayNow, S$6.80)", payload: buildPaymentQr({ scheme: "PAYNOW", proxy: "202012345A", proxyKind: "UEN", name: "KOPI AND CO", city: "SINGAPORE", amount: "6.80" }) },
  { label: "Hawker stall (PayNow, any amount)", payload: buildPaymentQr({ scheme: "PAYNOW", proxy: "+6591234567", proxyKind: "MOBILE", name: "AH HOCK CHICKEN RICE", city: "SINGAPORE" }) },
  { label: "Bangkok café (PromptPay, ฿250)", payload: buildPaymentQr({ scheme: "PROMPTPAY", proxy: "0066812345678", proxyKind: "MOBILE", name: "BANGKOK CAFE", city: "BANGKOK", amount: "250.00" }) },
  { label: "São Paulo shop (Pix, R$50)", payload: buildPaymentQr({ scheme: "PIX", proxy: "loja@example.com", name: "LOJA PAULISTA", city: "SAO PAULO", amount: "50.00" }) },
  { label: "Jakarta warung (QRIS)", payload: buildPaymentQr({ scheme: "QRIS", proxy: "ID1020012345678", name: "WARUNG BU SRI", city: "JAKARTA", amount: "45000" }) },
]

const SYMBOL: Record<string, string> = { SGD: "S$", THB: "฿", BRL: "R$", IDR: "Rp", USD: "$" }

function mask(v: string) {
  return v.length <= 4 ? v : `${"•".repeat(4)}${v.slice(-4)}`
}

function decodeImage(img: CanvasImageSource, w: number, h: number, canvas: HTMLCanvasElement): string | null {
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h)
  return jsQR(data.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null
}

type Result = { ok: true; message: string } | { ok: false; message: string }

export default function PayScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const [camera, setCamera] = useState<"off" | "starting" | "on">("off")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [qr, setQr] = useState<ParsedQr | null>(null)
  const [amount, setAmount] = useState("")
  const [quote, setQuote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const key = useRef<string | null>(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCamera("off")
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const load = useCallback((payload: string) => {
    const parsed = parsePaymentQr(payload)
    setText(payload)
    setQr(parsed)
    setAmount(parsed.amount ?? "")
    setResult(null)
    key.current = null
  }, [])

  async function startCamera() {
    setCameraError(null)
    setCamera("starting")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      setCamera("on")
      const tick = () => {
        if (!streamRef.current) return
        if (video.readyState >= 2 && canvasRef.current) {
          const scale = Math.min(1, 640 / (video.videoWidth || 640))
          const found = decodeImage(video, Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale), canvasRef.current)
          if (found) {
            load(found)
            stopCamera()
            return
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch (e) {
      setCamera("off")
      setCameraError(e instanceof Error && e.name === "NotAllowedError" ? "Camera access was blocked. Upload a picture of the code instead." : "No camera available. Upload a picture of the code instead.")
    }
  }

  function onUpload(file: File | undefined) {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
      const found = canvasRef.current ? decodeImage(img, Math.round(img.width * scale), Math.round(img.height * scale), canvasRef.current) : null
      URL.revokeObjectURL(url)
      if (found) load(found)
      else setResult({ ok: false, message: "Couldn't find a QR code in that picture. Try a closer, sharper photo." })
    }
    img.src = url
  }

  const payNowRecipient = useMemo(() => {
    if (qr?.scheme !== "PAYNOW" || !qr.proxy) return null
    return {
      name: qr.merchantName ?? "PayNow payee",
      proxyType: qr.proxy.type === "UEN" ? ("UEN" as const) : ("MOBILE" as const),
      proxyValue: qr.proxy.type === "UEN" ? qr.proxy.value : payNowMobile(qr.proxy.value),
    }
  }, [qr])

  // Live quote for PayNow: what the payee gets in SGD vs what leaves your balance in USDC.
  useEffect(() => {
    const t = setTimeout(async () => {
      setQuote(null)
      if (!payNowRecipient || !(Number(amount) > 0)) return
      const res = await fetch("/api/sancus/payouts/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: payNowRecipient, sgdAmount: Number(amount).toFixed(2) }),
      }).catch(() => null)
      const body = await res?.json().catch(() => null)
      const usdc = body?.quote?.usdcAmountMinor
      const rate = body?.quote?.clientRate as string | undefined
      if (usdc) setQuote(`$${(Number(usdc) / 1e6).toFixed(2)} USDC from your balance${rate ? ` · 1 USDC = S$${rate}` : ""}`)
    }, 350)
    return () => clearTimeout(t)
  }, [payNowRecipient, amount])

  async function pay() {
    if (!qr) return
    const value = Number(amount)
    if (!(value > 0)) return setResult({ ok: false, message: "Enter an amount." })
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setResult(null)
    try {
      let res: Response
      if (qr.scheme === "PAYNOW" && payNowRecipient) {
        res = await fetch("/api/sancus/payouts", {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": key.current },
          body: JSON.stringify({ recipient: payNowRecipient, sgdAmount: value.toFixed(2), reference: "QR payment" }),
        })
      } else if (qr.scheme === "PROMPTPAY" && qr.proxy) {
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
        setResult({ ok: false, message: "Paying QRIS codes isn't available yet. Ask the merchant for bank details instead." })
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
            PayNow, PromptPay and Pix codes are paid from your USDC balance, converted at the live rate.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-label="Scan">
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "var(--sx-surface-2, #111)", aspectRatio: "4 / 3", display: "grid", placeItems: "center" }}>
            <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: camera === "off" ? "none" : "block" }} />
            {camera === "off" ? <span className="body-s muted" style={{ padding: 16, textAlign: "center" }}>Camera is off</span> : null}
          </div>
          <canvas ref={canvasRef} hidden />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            {camera === "off" ? (
              <button type="button" className="sx-btn sx-btn--primary" onClick={startCamera}>
                Start camera
              </button>
            ) : (
              <button type="button" className="sx-btn sx-btn--secondary" onClick={stopCamera}>
                {camera === "starting" ? "Starting…" : "Stop camera"}
              </button>
            )}
            <label className="sx-btn sx-btn--secondary" style={{ cursor: "pointer" }}>
              Upload a picture
              <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
            </label>
          </div>
          {cameraError ? <p className="body-s" style={{ color: "var(--sx-danger, #c33)" }}>{cameraError}</p> : null}

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
