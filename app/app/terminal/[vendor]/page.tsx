"use client"

// A mock vendor terminal (the "sandbox" side of the cross-rail demo). The shop keys in an amount and shows its
// Pix / PromptPay / QRIS code, or, for a US card shop, waits for a tap. When a personal Sancus account pays it,
// the payer's screen broadcasts on this terminal's reference and the receipt appears here, showing the rail the
// customer funded it with and the partner bank that paid the shop out.
import Link from "next/link"
import QRCode from "qrcode"
import { use, useCallback, useEffect, useState } from "react"
import { COUNTRIES, RAILS, formatMoney, newTerminalRef, posUrl, vendorById, vendorQr } from "@/lib/sancus/cross-rail"
import { subscribeTerminal, type TerminalEvent } from "@/lib/sancus/terminal-channel"

type Phase = "entry" | "waiting" | "processing" | "paid"
type Paid = Extract<TerminalEvent, { type: "paid" }>
type Processing = Extract<TerminalEvent, { type: "processing" }>

export default function TerminalPage({ params }: { params: Promise<{ vendor: string }> }) {
  const { vendor: id } = use(params)
  const vendor = vendorById(id)
  const [phase, setPhase] = useState<Phase>("entry")
  const [amount, setAmount] = useState(vendor?.sampleAmount ?? "")
  const [ref, setRef] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [payload, setPayload] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [incoming, setIncoming] = useState<Processing | null>(null)
  const [paid, setPaid] = useState<Paid | null>(null)

  const currency = vendor ? COUNTRIES[vendor.country].currency : "USD"
  const wholeOnly = currency === "IDR"
  const isCard = vendor?.rail === "CARD"

  const charge = useCallback(async () => {
    if (!vendor || !(Number(amount) > 0)) return
    const r = newTerminalRef()
    const normalized = wholeOnly ? String(Math.round(Number(amount))) : Number(amount).toFixed(2)
    const payload = isCard ? posUrl(window.location.origin, { t: r, m: vendor.id, a: normalized }) : vendorQr(vendor, normalized, r)
    const url = await QRCode.toDataURL(payload, { width: 480, margin: 1, errorCorrectionLevel: "M" })
    setAmount(normalized)
    setRef(r)
    setQr(url)
    setPayload(payload)
    setCopied(false)
    setIncoming(null)
    setPaid(null)
    setPhase("waiting")
  }, [vendor, amount, wholeOnly, isCard])

  useEffect(() => {
    if (!ref) return
    return subscribeTerminal(ref, (e) => {
      if (e.type === "processing") {
        setIncoming(e)
        setPhase((p) => (p === "paid" ? p : "processing"))
      } else {
        setPaid(e)
        setPhase("paid")
      }
    })
  }, [ref])

  function press(k: string) {
    setAmount((a) => {
      if (k === "⌫") return a.slice(0, -1)
      if (k === ".") return wholeOnly || a.includes(".") ? a : `${a || "0"}.`
      const next = a === "0" ? k : a + k
      const [, dec] = next.split(".")
      if (dec && dec.length > 2) return a
      return next.length > 12 ? a : next
    })
  }

  function newSale() {
    setPhase("entry")
    setRef(null)
    setQr(null)
    setIncoming(null)
    setPaid(null)
  }

  if (!vendor) {
    return (
      <div className="xt-wrap">
        <p className="body-s">No such terminal.</p>
        <Link href="/terminal">All terminals</Link>
      </div>
    )
  }

  const display = Number(amount) > 0 ? formatMoney(Number(amount), currency) : formatMoney(0, currency)

  return (
    <div className="xt-wrap" style={{ maxWidth: 460 }}>
      <div className="xt-top">
        <Link href="/terminal" className="sx-btn sx-btn--quiet">
          ← All terminals
        </Link>
        <span className="sx-pill sx-pill--simulated">Sandbox vendor</span>
      </div>

      <div className="xt-device">
        <div className="xt-screen">
          <div className="xt-head">
            <span>{vendor.terminalId}</span>
            <span>{RAILS[vendor.rail].label}{isCard ? " · contactless" : ""}</span>
          </div>
          <div className="xr-vendor">
            <span className="xr-avatar" aria-hidden>
              {vendor.initials}
            </span>
            <div>
              <span className="body-strong">{vendor.name}</span>
              <span className="body-s muted">{vendor.city}</span>
            </div>
          </div>

          {phase === "entry" ? (
            <>
              <div className="xt-amount" aria-live="polite">
                {display}
              </div>
              <div className="xt-keys">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", wholeOnly ? "00" : ".", "0", "⌫"].map((k) => (
                  <button key={k} type="button" onClick={() => (k === "00" ? (press("0"), press("0")) : press(k))} aria-label={k === "⌫" ? "Delete" : k}>
                    {k}
                  </button>
                ))}
              </div>
              <button type="button" className="sx-btn sx-btn--primary" disabled={!(Number(amount) > 0)} onClick={charge}>
                Charge {display}
              </button>
            </>
          ) : null}

          {phase === "waiting" || phase === "processing" ? (
            <>
              <div className="xt-amount">{display}</div>
              {isCard ? (
                <div className="xt-qr">
                  <div className="xt-contactless" aria-hidden>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                      <path d="M8.5 8.5a5 5 0 0 1 0 7" />
                      <path d="M11.5 6a8.5 8.5 0 0 1 0 12" />
                      <path d="M14.5 3.5a12 12 0 0 1 0 17" />
                    </svg>
                  </div>
                  <span className="body-strong">Tap card or phone</span>
                  {qr ? <img src={qr} alt="Sancus tap code" style={{ width: 150, height: 150 }} /> : null}
                  <span className="body-s muted" style={{ textAlign: "center" }}>
                    Demo tap: scan this from a personal Sancus account to tap your Sancus card.
                  </span>
                </div>
              ) : (
                <div className="xt-qr">
                  {qr ? <img src={qr} alt={`${RAILS[vendor.rail].label} code for ${display}`} /> : null}
                  <span className="body-s muted" style={{ textAlign: "center" }}>
                    Scan with any {RAILS[vendor.rail].label} app, or with Sancus to pay from any rail.
                  </span>
                </div>
              )}
              {phase === "processing" && incoming ? (
                <div className="xt-receipt" role="status">
                  <span className="xt-wait">Payment incoming from {incoming.payerName}</span>
                  <span className="body-s muted" style={{ textAlign: "center" }}>
                    Funded by {incoming.sourceLabel} · {incoming.sourceRail}
                  </span>
                </div>
              ) : (
                <span className="xt-wait">Waiting for the customer</span>
              )}
              <div className="filters" style={{ justifyContent: "center" }}>
                {payload ? (
                  <button
                    type="button"
                    className="sx-btn sx-btn--quiet"
                    data-payload={payload}
                    onClick={() => void navigator.clipboard?.writeText(payload).then(() => setCopied(true), () => setCopied(false))}
                  >
                    {copied ? "Copied" : "Copy code"}
                  </button>
                ) : null}
                <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={newSale}>
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {phase === "paid" && paid ? (
            <>
              <div className="xt-paid" role="status">
                <span className="xt-check" aria-hidden>
                  ✓
                </span>
                <span className="sx-label" style={{ color: "inherit" }}>
                  {isCard ? "Approved" : `Received by ${paid.payoutRail}`}
                </span>
                <span className="xt-amount" style={{ color: "var(--ink)" }}>
                  {paid.amountLabel}
                </span>
              </div>
              <div className="xt-receipt">
                {isCard ? (
                  <div className="kv">
                    <span>Card</span>
                    <span>Sancus Visa •••• {paid.cardLast4}</span>
                  </div>
                ) : null}
                <div className="kv">
                  <span>Customer</span>
                  <span>{paid.payerName}</span>
                </div>
                <div className="kv">
                  <span>Funded by</span>
                  <span>
                    {paid.sourceLabel} · {paid.sourceRail}
                  </span>
                </div>
                <div className="kv">
                  <span>Settled by</span>
                  <span>
                    {paid.payoutBank} · {paid.payoutRail}
                  </span>
                </div>
                <div className="kv">
                  <span>Reference</span>
                  <span style={{ overflowWrap: "anywhere" }}>{paid.settlementRef}</span>
                </div>
                <div className="kv">
                  <span>Time</span>
                  <span>{new Date(paid.at).toLocaleTimeString()}</span>
                </div>
                <div className="kv">
                  <span>Network</span>
                  <span>{paid.live ? "Live sandbox" : "Simulated"}</span>
                </div>
              </div>
              <button type="button" className="sx-btn sx-btn--primary" onClick={newSale}>
                New sale
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
