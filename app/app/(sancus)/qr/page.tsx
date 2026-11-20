"use client"

// Pay with QR: Sancus-to-Sancus payments across borders, like scanning a friend's code to pay them.
//   Receive: show your "scan to pay me" code (optionally with an amount in USD, THB, IDR or BRL).
//   Pay: scan someone's Sancus code with the camera (phone back camera, laptop webcam), check the
//        live conversion and pay. The USDC moves onchain on Arc to their account.
// A Sancus code is a link (/qr?pay=…), so opening it from a phone's own camera lands right here.
// Local PromptPay / Pix / QRIS merchant codes are handed to Pay › Scan a QR.
import QRCode from "qrcode"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { QrScanner } from "@/components/sancus-ui/qr-scanner"
import { parseSancusQrUrl } from "@/lib/sancus/sancus-qr-parse"
import { can, useAccount } from "@/lib/sancus/use-account"

type Currency = "USD" | "THB" | "IDR" | "BRL"
const CURRENCIES: { code: Currency; label: string; symbol: string; decimals: number }[] = [
  { code: "USD", label: "US dollar", symbol: "$", decimals: 2 },
  { code: "THB", label: "Thai baht", symbol: "฿", decimals: 2 },
  { code: "IDR", label: "Indonesian rupiah", symbol: "Rp ", decimals: 0 },
  { code: "BRL", label: "Brazilian real", symbol: "R$ ", decimals: 2 },
]
const cur = (c: Currency) => CURRENCIES.find((x) => x.code === c)!
const money = (c: Currency, n: number) => `${cur(c).symbol}${n.toLocaleString("en-US", { minimumFractionDigits: cur(c).decimals, maximumFractionDigits: cur(c).decimals })}`

type Resolved = { code: string; receiver: { name: string; kind: string }; currency: Currency; amount: number | null; note: string | null; rate: number | null; self: boolean }
type Payment = { id: string; direction: "in" | "out"; counterparty: string; currency: Currency; amountMinor: string; usdcAmountMinor: string; note: string | null; status: string; txHash: string | null; createdAt: string }

export default function QrPageWrapper() {
  return (
    <Suspense fallback={<div className="page" />}>
      <QrPage />
    </Suspense>
  )
}

function QrPage() {
  const params = useSearchParams()
  const router = useRouter()
  const { account } = useAccount()
  const canSend = can(account, "money.send")
  const canReceive = account ? account.type !== "EMPLOYEE" : true
  const incoming = params.get("pay")
  // Links (and the agent) can open "My code" with an amount ready: /qr?tab=receive&amount=25&currency=THB
  const wantsReceive = params.get("tab") === "receive"
  const receiveCurrency = (["USD", "THB", "IDR", "BRL"].includes((params.get("currency") ?? "").toUpperCase())
    ? (params.get("currency") ?? "").toUpperCase()
    : "USD") as Currency
  const receiveAmount = params.get("amount") ?? ""
  const receiveNote = params.get("note") ?? ""
  const receiveKey = `${wantsReceive}|${receiveCurrency}|${receiveAmount}|${receiveNote}`
  const [tab, setTab] = useState<"pay" | "receive">(wantsReceive ? "receive" : "pay")
  // Already on this page when the agent opens a new receive link: switch tabs.
  useEffect(() => {
    if (!wantsReceive) return
    const t = setTimeout(() => setTab("receive"), 0)
    return () => clearTimeout(t)
  }, [wantsReceive, receiveKey])
  const [payments, setPayments] = useState<Payment[]>([])

  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/sancus/qr/payments", { cache: "no-store" }).catch(() => null)
    if (res?.ok) setPayments(((await res.json()) as { payments: Payment[] }).payments)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => void loadPayments(), 0)
    return () => clearTimeout(t)
  }, [loadPayments])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Pay with QR</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Scan another Sancus user&apos;s code to pay them in any country, or show yours to get paid. Converted at the live rate, settled onchain.
          </p>
        </div>
      </header>

      <div className="filters" role="group" aria-label="QR mode" style={{ marginBottom: 16 }}>
        <button type="button" className="chip" aria-pressed={tab === "pay"} onClick={() => setTab("pay")}>
          Scan to pay
        </button>
        {canReceive ? (
          <button type="button" className="chip" aria-pressed={tab === "receive"} onClick={() => setTab("receive")}>
            My code (receive)
          </button>
        ) : null}
      </div>

      <div className="grid">
        <section className="tile s7">
          {tab === "pay" ? (
            <PayPanel
              initialCode={incoming}
              canSend={canSend}
              onPaid={() => {
                void loadPayments()
                if (incoming) router.replace("/qr")
              }}
            />
          ) : (
            <ReceivePanel key={receiveKey} initialCurrency={receiveCurrency} initialAmount={receiveAmount} initialNote={receiveNote} />
          )}
        </section>
        <aside className="tile s5">
          <span className="sx-label">Recent QR payments</span>
          {payments.length === 0 ? (
            <p className="body-s muted">None yet. Payments you send or receive by QR show up here.</p>
          ) : (
            <div className="sx-rows" style={{ marginTop: 8 }}>
              {payments.map((p) => {
                const c = cur(p.currency)
                const local = Number(p.amountMinor) / 10 ** c.decimals
                return (
                  <div key={p.id} className="sx-row">
                    <span className="sx-row__who">
                      {p.direction === "in" ? "From " : "To "}
                      {p.counterparty}
                      {p.note ? <span className="muted"> · {p.note}</span> : null}
                    </span>
                    <span className="sx-row__amount" style={{ color: p.direction === "in" ? "var(--settled)" : undefined }}>
                      {p.direction === "in" ? "+" : "−"}
                      {money(p.currency, local)}
                    </span>
                    <span className="sx-row__meta">
                      ${(Number(p.usdcAmountMinor) / 1e6).toFixed(2)} USDC ·{" "}
                      {p.txHash ? (
                        <a href={`https://explorer.testnet.arc.io/tx/${p.txHash}`} target="_blank" rel="noreferrer">
                          Arc tx
                        </a>
                      ) : (
                        p.status.toLowerCase()
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function PayPanel({ initialCode, canSend, onPaid }: { initialCode: string | null; canSend: boolean; onPaid: () => void }) {
  const router = useRouter()
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [amount, setAmount] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Payment | null>(null)
  const key = useRef<string | null>(null)

  const resolve = useCallback(async (code: string) => {
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      const res = await fetch("/api/sancus/qr/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't read that code")
      setResolved({ code, ...body })
      setAmount(body.amount != null ? String(body.amount) : "")
      key.current = null
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!initialCode) return
    const t = setTimeout(() => void resolve(initialCode), 0)
    return () => clearTimeout(t)
  }, [initialCode, resolve])

  function onScan(text: string) {
    const token = parseSancusQrUrl(text)
    if (token) return void resolve(token)
    // A local merchant code (PromptPay, Pix, QRIS): pay it on the local-rail scan page.
    if (/^000201/.test(text.trim())) return router.push(`/pay/scan?code=${encodeURIComponent(text.trim())}`)
    setError("That QR isn't a Sancus code or a PromptPay / Pix code.")
  }

  async function pay() {
    if (!resolved) return
    const n = Number(amount.replace(/,/g, ""))
    if (!(n > 0)) return setError("Enter an amount")
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sancus/qr/pay", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ code: resolved.code, amount: resolved.amount == null ? n : undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Payment failed")
      setDone(body.payment as Payment)
      onPaid()
    } catch (e) {
      setError((e as Error).message)
      key.current = null
    } finally {
      setBusy(false)
    }
  }

  if (!canSend) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <h2 className="sx-h heading-3" style={{ margin: 0 }}>Scan to pay</h2>
        <p className="body-s muted">This account can&apos;t send money from a balance. Pay merchants with your card, or ask your admin.</p>
        <Link href="/card" className="sx-btn sx-btn--secondary" style={{ justifySelf: "start" }}>Pay by virtual card</Link>
      </div>
    )
  }

  if (done) {
    const local = Number(done.amountMinor) / 10 ** cur(done.currency).decimals
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <span className="sx-pill sx-pill--settled" style={{ justifySelf: "start" }}>Paid</span>
        <h2 className="sx-h heading-2" style={{ margin: 0 }}>{money(done.currency, local)} to {done.counterparty}</h2>
        <p className="body-s muted" style={{ margin: 0 }}>
          ${(Number(done.usdcAmountMinor) / 1e6).toFixed(2)} USDC moved on Arc.{" "}
          {done.txHash ? (
            <a href={`https://explorer.testnet.arc.io/tx/${done.txHash}`} target="_blank" rel="noreferrer">View the transaction</a>
          ) : null}
        </p>
        <button type="button" className="sx-btn sx-btn--primary" style={{ justifySelf: "start" }} onClick={() => { setDone(null); setResolved(null) }}>
          Scan another
        </button>
      </div>
    )
  }

  if (resolved) {
    const n = Number(amount.replace(/,/g, ""))
    const usdc = resolved.rate && n > 0 ? n / resolved.rate : null
    return (
      <div style={{ display: "grid", gap: 14 }}>
        <span className="sx-label">Paying</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="av av--lg">{resolved.receiver.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
          <div style={{ display: "grid" }}>
            <h2 className="sx-h heading-3" style={{ margin: 0 }}>{resolved.receiver.name}</h2>
            <span className="body-s muted">
              Sancus {resolved.receiver.kind === "business" ? "business" : "personal"} account · gets {cur(resolved.currency).label}
            </span>
          </div>
        </div>
        {resolved.note ? <span className="body-s">For: {resolved.note}</span> : null}
        {resolved.self ? <span className="body-s" role="alert">This is your own code.</span> : null}
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">{resolved.amount == null ? `How much do you want to send? (${resolved.currency})` : `Amount (${resolved.currency})`}</span>
          <input
            className="sx-field__input"
            inputMode="decimal"
            value={amount}
            readOnly={resolved.amount != null}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder={resolved.currency === "IDR" ? "50000" : "0.00"}
            autoFocus={resolved.amount == null}
          />
        </label>
        {resolved.amount != null ? (
          <span className="body-s muted">Amount set by {resolved.receiver.name}.</span>
        ) : (
          <span className="body-s muted">This code doesn&apos;t include an amount. Enter what you want to send; {resolved.receiver.name} receives it in {cur(resolved.currency).label}.</span>
        )}
        <div className="kv">
          <span>From your balance</span>
          <span>{usdc != null ? `$${usdc.toFixed(2)} USDC` : "–"}</span>
        </div>
        {resolved.rate && resolved.currency !== "USD" ? (
          <div className="kv">
            <span>Rate</span>
            <span>1 USDC = {resolved.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} {resolved.currency}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="sx-btn sx-btn--primary" onClick={pay} disabled={busy || !(n > 0) || resolved.self}>
            {busy ? "Paying…" : n > 0 ? `Pay ${money(resolved.currency, n)}` : "Pay"}
          </button>
          <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setResolved(null)} disabled={busy}>
            Cancel
          </button>
        </div>
        {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed, #c0392b)" }}>{error}</p> : null}
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 className="sx-h heading-3" style={{ margin: 0 }}>Scan to pay</h2>
      <QrScanner onResult={onScan} autoStart hint="Point your camera at the other person's Sancus code" />
      {busy ? <span className="body-s muted">Reading the code…</span> : null}
      {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed, #c0392b)" }}>{error}</p> : null}
      <p className="body-s muted" style={{ margin: 0 }}>
        Paying a shop&apos;s PromptPay or Pix code? Scan it here too and we&apos;ll take you to <Link href="/pay/scan">Scan a QR</Link>.
      </p>
    </div>
  )
}

function ReceivePanel({ initialCurrency, initialAmount, initialNote }: { initialCurrency: Currency; initialAmount: string; initialNote: string }) {
  const { account } = useAccount()
  const [currency, setCurrency] = useState<Currency>(initialCurrency)
  const [amount, setAmount] = useState(initialAmount)
  const [note, setNote] = useState(initialNote)
  const [code, setCode] = useState<{ url: string; name: string; image: string; amount: number | null; currency: Currency; note: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generate = useCallback(async (opts: { currency: Currency; amount?: string; note?: string }) => {
    setError(null)
    const qs = new URLSearchParams({ currency: opts.currency })
    const n = Number((opts.amount ?? "").replace(/,/g, ""))
    if (n > 0) qs.set("amount", String(n))
    if (opts.note?.trim()) qs.set("note", opts.note.trim())
    const get = () => fetch(`/api/sancus/qr?${qs}`, { cache: "no-store" }).catch(() => null)
    let res = await get()
    // A session that just expired is usually refreshed by the first call; try once more.
    if (res?.status === 401) {
      await new Promise((r) => setTimeout(r, 600))
      res = await get()
    }
    const body = await res?.json().catch(() => null)
    if (res?.status === 401) return setError("Your session expired. Refresh the page (or sign in again) and try once more.")
    if (!res?.ok || !body?.url) return setError(body?.error ?? "Couldn't make your code")
    const image = await QRCode.toDataURL(body.url, { width: 640, margin: 4, errorCorrectionLevel: "L" })
    setCode({ url: body.url, name: body.receiver.name, image, amount: body.amount, currency: body.currency, note: body.note })
  }, [])

  // Show a reusable code straight away.
  useEffect(() => {
    const t = setTimeout(() => void generate({ currency: initialCurrency, amount: initialAmount, note: initialNote }), 0)
    return () => clearTimeout(t)
  }, [generate, initialCurrency, initialAmount, initialNote])

  async function share() {
    if (!code) return
    const text = `Pay ${code.name} on Sancus`
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: code.url })
        return
      } catch {
        /* cancelled: fall back to copying */
      }
    }
    await navigator.clipboard?.writeText(code.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <h2 className="sx-h heading-3" style={{ margin: 0 }}>Your Sancus code</h2>
      {code ? (
        <div style={{ display: "grid", justifyItems: "center", gap: 8, padding: 16, borderRadius: 16, background: "#fff", border: "1px solid var(--line)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={code.image} alt={`QR code to pay ${code.name}`} width={280} height={280} style={{ width: "min(280px, 70vw)", height: "auto" }} />
          <b style={{ color: "#12201e" }}>{code.name}</b>
          <span className="body-s" style={{ color: "#5a6966" }}>
            {code.amount != null ? `Asking ${money(code.currency, code.amount)}` : `Any amount · ${cur(code.currency).label}`}
            {code.note ? ` · ${code.note}` : ""}
          </span>
        </div>
      ) : (
        <div className="empty">Making your code…</div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="sx-btn sx-btn--secondary" onClick={share} disabled={!code}>
          {copied ? "Link copied" : "Share link"}
        </button>
      </div>

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
        <input className="sx-field__input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dinner, or invoice INV-88" maxLength={80} />
      </label>
      <button type="button" className="sx-btn sx-btn--primary" style={{ justifySelf: "start" }} onClick={() => void generate({ currency, amount, note })}>
        Update code
      </button>
      <p className="body-s muted" style={{ margin: 0 }}>
        The payer scans this with Sancus (or their phone camera), sees your name and the amount, and pays. The money lands in your Sancus balance as USDC. Codes with an amount expire after a day.
      </p>
      {account && account.type !== "EMPLOYEE" ? (
        <p className="body-s muted" style={{ margin: 0 }}>
          Customer without Sancus paying by PromptPay, QRIS or Pix? <Link href="/receive">Make a local QR</Link>.
        </p>
      ) : null}
      {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed, #c0392b)" }}>{error}</p> : null}
    </div>
  )
}
