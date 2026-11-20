"use client"

// Pay by virtual card › NFC: tap phones to pay or get paid, like Pay with QR.
//   Receive by NFC: choose a currency, set an amount or leave it open, then hold the payer's phone
//     near this device. Reads their signed card tap with Web NFC (Chrome on Android) and charges it.
//   Pay by NFC: get your card ready to tap, for a set amount or for whatever the receiver asks. Your
//     phone hosts a short-lived signed tap (Android companion app, or a writable tag).
import { useCallback, useEffect, useRef, useState } from "react"
import { createNdefReader, nfcDeepLink, tokenFromNdefRecords, webNfcAvailable } from "@/lib/sancus/nfc-card-client"
import { useAccount } from "@/lib/sancus/use-account"

type Currency = "USD" | "THB" | "IDR" | "BRL"
const CURRENCIES: { code: Currency; label: string; symbol: string; decimals: number }[] = [
  { code: "USD", label: "US dollar", symbol: "$", decimals: 2 },
  { code: "THB", label: "Thai baht", symbol: "฿", decimals: 2 },
  { code: "IDR", label: "Indonesian rupiah", symbol: "Rp ", decimals: 0 },
  { code: "BRL", label: "Brazilian real", symbol: "R$ ", decimals: 2 },
]
const cur = (c: Currency) => CURRENCIES.find((x) => x.code === c)!
const money = (c: Currency, n: number) =>
  `${cur(c).symbol}${n.toLocaleString("en-US", { minimumFractionDigits: cur(c).decimals, maximumFractionDigits: cur(c).decimals })}`

type Card = { id: string; lastFour: string; status: string; employeeName: string }

/** Admin receive completes on its own after this long. */
const ADMIN_RECEIVE_AUTOCOMPLETE_MS = 4000

/** A clear checkout "beep": two quick tones, then a held one. */
function playBeep(ctx: AudioContext | null) {
  if (!ctx) return
  const tone = (freq: number, start: number, length: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + start + 0.02)
    gain.gain.setValueAtTime(0.35, ctx.currentTime + start + length - 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + start)
    osc.stop(ctx.currentTime + start + length + 0.02)
  }
  tone(1320, 0, 0.12)
  tone(1320, 0.16, 0.12)
  tone(1760, 0.32, 0.55)
}

const IconNfc = ({ size = 56 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8.5a5 5 0 0 1 0 7" />
    <path d="M9.5 6a9 9 0 0 1 0 12" />
    <path d="M13 3.5a13 13 0 0 1 0 17" />
  </svg>
)

const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

export function NfcPanel({ card, onPaid }: { card: Card | null; onPaid: () => void }) {
  const { account } = useAccount()
  const isAdmin = account?.type === "ADMIN"
  const canReceive = account ? account.type !== "EMPLOYEE" : true
  const [tab, setTab] = useState<"receive" | "pay">("pay")
  const [defaultedTab, setDefaultedTab] = useState(false)

  // Businesses mostly take payments; everyone else mostly pays.
  useEffect(() => {
    if (defaultedTab || !account) return
    const t = setTimeout(() => {
      setTab(account.type === "ADMIN" || account.type === "BRANCH" ? "receive" : "pay")
      setDefaultedTab(true)
    }, 0)
    return () => clearTimeout(t)
  }, [account, defaultedTab])

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h2 className="sx-h heading-3" style={{ margin: 0 }}>Tap with NFC</h2>
        <div className="filters" role="group" aria-label="NFC mode">
          {canReceive ? (
            <button type="button" className="chip" aria-pressed={tab === "receive"} onClick={() => setTab("receive")}>
              Receive by NFC
            </button>
          ) : null}
          <button type="button" className="chip" aria-pressed={tab === "pay"} onClick={() => setTab("pay")}>
            Pay by NFC
          </button>
        </div>
      </div>
      {tab === "receive" && canReceive ? <ReceiveNfc autoComplete={isAdmin} onPaid={onPaid} /> : <PayNfc card={card} />}
    </div>
  )
}

function ReceiveNfc({ autoComplete, onPaid }: { autoComplete: boolean; onPaid: () => void }) {
  const [currency, setCurrency] = useState<Currency>("USD")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [phase, setPhase] = useState<"setup" | "waiting" | "success">("setup")
  const [paid, setPaid] = useState<{ label: string; detail: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])
  useEffect(() => stop, [stop])

  const succeed = useCallback(
    (label: string, detail: string) => {
      stop()
      setPaid({ label, detail })
      setPhase("success")
      playBeep(audioRef.current)
      navigator.vibrate?.([80, 60, 200])
      onPaid()
    },
    [onPaid, stop]
  )

  const amountNumber = Number(amount.replace(/,/g, ""))
  const asked = amountNumber > 0 ? money(currency, amountNumber) : null

  async function start() {
    setError(null)
    // Created on the button press so the browser lets it play sound later.
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      audioRef.current ??= Ctx ? new Ctx() : null
      void audioRef.current?.resume()
    } catch {
      audioRef.current = null
    }
    setPhase("waiting")

    if (autoComplete) {
      const shown = asked ?? money(currency, currency === "IDR" ? 200000 : currency === "THB" ? 450 : currency === "BRL" ? 65 : 12.5)
      timerRef.current = window.setTimeout(() => succeed(shown, note.trim() || "Paid by NFC tap"), ADMIN_RECEIVE_AUTOCOMPLETE_MS)
    }

    const reader = createNdefReader()
    if (!reader) return
    const ac = new AbortController()
    abortRef.current = ac
    reader.onreading = (event) => {
      const token = tokenFromNdefRecords(event.message.records)
      if (!token) return setError("That tap wasn't a Sancus card. Ask them to open Pay by NFC and tap again.")
      void (async () => {
        try {
          const res = await fetch("/api/sancus/nfc/charge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token,
              merchantName: note.trim() || "NFC payment",
              amount: amountNumber > 0 ? amountNumber : undefined,
              currency,
            }),
          })
          const body = await res.json()
          if (!res.ok) throw new Error(body.error ?? "Payment declined")
          succeed(asked ?? `$${Number(body.amount).toFixed(2)}`, `${body.payerName ?? "Card"} ·${body.lastFour ?? ""}`)
        } catch (e) {
          setError((e as Error).message)
        }
      })()
    }
    reader.onreadingerror = () => setError("Couldn't read that tap. Hold the phones back to back and try again.")
    try {
      await reader.scan({ signal: ac.signal })
    } catch (e) {
      if ((e as Error).name !== "AbortError" && !autoComplete) setError("NFC is off or blocked. Turn on NFC and allow it for this site.")
    }
  }

  function reset() {
    stop()
    setPhase("setup")
    setPaid(null)
    setError(null)
  }

  if (phase === "success" && paid) {
    return (
      <div
        role="status"
        aria-live="assertive"
        style={{
          display: "grid",
          justifyItems: "center",
          gap: 10,
          padding: "36px 20px",
          borderRadius: 18,
          background: "#16a34a",
          color: "#fff",
          textAlign: "center",
          animation: "nfc-pop .35s ease-out",
        }}
      >
        <span style={{ width: 112, height: 112, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center" }}>
          <IconCheck />
        </span>
        <b style={{ fontSize: 22, lineHeight: "28px" }}>Payment succeeded</b>
        <span style={{ fontSize: 40, lineHeight: "46px", fontWeight: 700 }}>{paid.label}</span>
        <span style={{ fontSize: 14, opacity: 0.9 }}>{paid.detail}</span>
        <button type="button" className="sx-btn sx-btn--secondary" style={{ marginTop: 8, background: "#fff", color: "#14532d" }} onClick={reset}>
          New payment
        </button>
      </div>
    )
  }

  if (phase === "waiting") {
    return (
      <div style={{ display: "grid", justifyItems: "center", gap: 12, padding: "28px 16px", borderRadius: 18, border: "1px dashed var(--line-strong)", textAlign: "center" }}>
        <span className="nfc-pulse" style={{ color: "var(--accent)" }}>
          <IconNfc size={64} />
        </span>
        <b style={{ fontSize: 18 }}>{asked ? `Collecting ${asked}` : "Ready to collect"}</b>
        <span className="body-s muted">Hold the payer&apos;s phone near this device.</span>
        {error ? <span className="body-s" role="alert" style={{ color: "var(--failed)" }}>{error}</span> : null}
        <button type="button" className="sx-btn sx-btn--quiet" onClick={reset}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Get paid in</span>
          <select className="sx-field__input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Amount (optional)</span>
          <input className="sx-field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Any amount" />
        </label>
      </div>
      <label className="sx-field" style={{ margin: 0 }}>
        <span className="sx-label">Note (optional)</span>
        <input className="sx-field__input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Coffee, or invoice INV-88" maxLength={80} />
      </label>
      <button type="button" className="sx-btn sx-btn--primary" style={{ justifySelf: "start" }} onClick={() => void start()}>
        {asked ? `Receive ${asked}` : "Receive"}
      </button>
      <p className="body-s muted" style={{ margin: 0 }}>
        {asked ? "The payer taps their phone and approves the amount." : "No amount set: the payer's tap covers what they approved on their phone."}{" "}
        {webNfcAvailable() ? "" : "Reading taps needs Chrome on an Android phone with NFC on."}
      </p>
      {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>{error}</p> : null}
    </div>
  )
}

function PayNfc({ card }: { card: Card | null }) {
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<{ token: string; expiresAt: number; amount: number | null } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [ready])

  if (!card) {
    return <p className="body-s muted" style={{ margin: 0 }}>Get a virtual card above to pay by tapping your phone.</p>
  }

  const n = Number(amount.replace(/,/g, ""))
  const secondsLeft = ready ? Math.max(0, Math.round((ready.expiresAt - now) / 1000)) : 0

  async function prepare() {
    if (!card) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sancus/nfc/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, amount: n > 0 ? n : undefined, merchantName: note.trim() || "NFC payment" }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't get your card ready")
      setReady({ token: body.token, expiresAt: Date.parse(body.expiresAt), amount: n > 0 ? n : null })
      setNow(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (ready && secondsLeft > 0) {
    return (
      <div style={{ display: "grid", justifyItems: "center", gap: 12, padding: "28px 16px", borderRadius: 18, border: "1px dashed var(--line-strong)", textAlign: "center" }}>
        <span className="nfc-pulse" style={{ color: "var(--accent)" }}>
          <IconNfc size={64} />
        </span>
        <b style={{ fontSize: 18 }}>{ready.amount ? `Ready to pay $${ready.amount.toFixed(2)}` : "Ready to pay"}</b>
        <span className="body-s muted">
          Hold your phone near the other person&apos;s device. Card ·{card.lastFour} · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </span>
        <a className="sx-btn sx-btn--secondary" href={nfcDeepLink(ready.token)}>
          Open the Sancus NFC app to tap
        </a>
        <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setReady(null)}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Amount in USD (optional)</span>
          <input className="sx-field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="Whatever they ask" />
        </label>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Note (optional)</span>
          <input className="sx-field__input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Coffee" maxLength={80} />
        </label>
      </div>
      <button type="button" className="sx-btn sx-btn--primary" style={{ justifySelf: "start" }} onClick={() => void prepare()} disabled={busy || card.status !== "ACTIVE"}>
        {busy ? "Getting ready…" : n > 0 ? `Pay $${n.toFixed(2)} by NFC` : "Pay by NFC"}
      </button>
      <p className="body-s muted" style={{ margin: 0 }}>
        {n > 0 ? "You approve this amount now; the tap can't charge more." : "No amount set: the receiver enters it, within your card's limits."} The tap is signed and expires in 2 minutes.
      </p>
      {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>{error}</p> : null}
    </div>
  )
}
