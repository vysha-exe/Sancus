"use client"

// Pay by virtual card.
//   Individuals can issue their own card. Business cards are issued to a database employee from
//   Team, and employees use the cards their admin assigned within their limits.
//   "Tap to pay" runs a card purchase against the monthly limit and settles it onchain on Arc.
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { VirtualCard } from "@/components/sancus-ui/virtual-card"
import { NfcPanel } from "@/components/sancus-ui/nfc-panel"
import { useAccount } from "@/lib/sancus/use-account"

type Card = {
  id: string
  label: string
  currency: string
  monthlyLimitMinor: string
  usedMinor: string
  lastFour: string
  status: string
  employeeName: string
  companyId: string | null
  fundingAccountId: string | null
  simulated: boolean
}
type Purchase = { id: string; cardId: string | null; merchantName: string; amountMinor: string; currency: string; status: string; txHash: string | null; createdAt: string }
type CardDetails = { pan: string; expiration: string; cvv: string }

const MERCHANTS = ["Grab ride · Jakarta", "7-Eleven · Bangkok", "iFood · São Paulo", "Starbucks · Austin", "AWS"]
const usd = (minor: number | string) => `$${(Number(minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CardPage() {
  const { account } = useAccount()
  const isEmployee = account?.type === "EMPLOYEE"
  const isIndividual = account?.type === "INDIVIDUAL"
  const [cards, setCards] = useState<Card[] | null>(null)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/sancus/my-card", { cache: "no-store" }).catch(() => null)
    const body = await res?.json().catch(() => null)
    if (!res?.ok) {
      const msg = String(body?.error ?? "Couldn't load your cards")
      // Don't flash a raw session error over the NFC panel; still unblock the page.
      if (msg.toLowerCase() !== "unauthorized") setError(msg)
      else setError(null)
      setCards([])
      setPurchases([])
      return
    }
    setError(null)
    setCards(body.cards)
    setPurchases(body.purchases)
    setSelected((cur) => cur ?? body.cards[0]?.id ?? null)
  }, [])
  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  // Show the new card straight away from the issue response, then refresh from the server.
  const onIssued = useCallback(
    (issued: Card) => {
      setCards((prev) => [{ ...issued, usedMinor: issued.usedMinor ?? "0" }, ...(prev ?? []).filter((c) => c.id !== issued.id)])
      setSelected(issued.id)
      void load()
    },
    [load]
  )

  const card = cards?.find((c) => c.id === selected) ?? cards?.[0] ?? null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Pay by virtual card</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            {isEmployee
              ? "The card your company gave you. Purchases stay within your limits."
              : isIndividual
                ? "A card that spends your Sancus balance anywhere cards are accepted, in any currency."
                : "Cards issued to your employees, funded from their assigned branch."}
          </p>
        </div>
      </header>

      {error ? <div className="tile s12" role="alert"><span className="body-s" style={{ color: "var(--failed)" }}>{error}</span></div> : null}

      {cards !== null ? (
        <section className="tile s12" style={{ marginBottom: 16 }}>
          <NfcPanel card={card} onPaid={() => void load()} />
        </section>
      ) : null}

      {cards === null ? (
        <div className="empty">Loading your card…</div>
      ) : !card ? (
        isEmployee ? (
          <section className="tile s12">
            <h2 className="sx-h heading-3" style={{ margin: 0 }}>No card yet</h2>
            <p className="body-s muted">Your admin issues cards from Team. Ask them for one.</p>
          </section>
        ) : isIndividual ? (
          <IssueCard onIssued={onIssued} />
        ) : (
          <section className="tile s12">
            <h2 className="sx-h heading-3" style={{ margin: 0 }}>Choose an employee first</h2>
            <p className="body-s muted">Business cards can only be issued to an active employee in your database.</p>
            <Link href="/team" className="sx-btn sx-btn--primary">Choose employee in Team</Link>
          </section>
        )
      ) : (
        <div className="grid">
          <section className="tile s5" style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <VirtualCard
              limit={`${usd(card.monthlyLimitMinor)} / month`}
              name={card.employeeName}
              num={`•••• •••• •••• ${card.lastFour}`}
              mark
              ariaLabel={`${card.label} ending ${card.lastFour}`}
            />
            {cards.length > 1 ? (
              <div className="filters" role="group" aria-label="Your cards">
                {cards.map((c) => (
                  <button key={c.id} type="button" className="chip" aria-pressed={c.id === card.id} onClick={() => setSelected(c.id)}>
                    {c.label} ·{c.lastFour}
                  </button>
                ))}
              </div>
            ) : null}
            <Usage card={card} />
            <div className="kv"><span>Status</span><span>{card.status.toLowerCase()}</span></div>
            <div className="kv">
              <span>Spends from</span>
              <span>{card.fundingAccountId ? "Your branch account" : card.companyId ? "Company balance" : "Your Sancus balance"}</span>
            </div>
            <div className="kv"><span>Network</span><span>Marqeta {card.simulated ? "(sandbox, simulated)" : "sandbox"}</span></div>
            <CardCredentials key={card.id} card={card} />
            {isIndividual ? <IssueCard compact onIssued={onIssued} /> : null}
          </section>

          <section className="tile s7" style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <TapToPay card={card} onPaid={() => void load()} />
            <div>
              <span className="sx-label">Recent card payments</span>
              {purchases.filter((p) => p.cardId === card.id).length === 0 ? (
                <p className="body-s muted">No purchases yet.</p>
              ) : (
                <div className="sx-rows" style={{ marginTop: 8 }}>
                  {purchases
                    .filter((p) => p.cardId === card.id)
                    .map((p) => (
                      <div key={p.id} className="sx-row">
                        <span className="sx-row__who">{p.merchantName}</span>
                        <span className="sx-row__amount">−{usd(p.amountMinor)}</span>
                        <span className="sx-row__meta">
                          {new Date(p.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
                          {p.txHash ? (
                            <a href={`https://explorer.testnet.arc.io/tx/${p.txHash}`} target="_blank" rel="noreferrer">Arc tx</a>
                          ) : (
                            p.status.toLowerCase()
                          )}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <p className="body-s muted" style={{ margin: 0 }}>
              Paying a friend or a shop that shows a QR instead? <Link href="/qr">Pay with QR</Link>.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

function CardCredentials({ card }: { card: Card }) {
  const [details, setDetails] = useState<CardDetails | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!details) return
    const timer = window.setTimeout(() => setDetails(null), 60_000)
    const hideWhenBackgrounded = () => {
      if (document.visibilityState === "hidden") setDetails(null)
    }
    document.addEventListener("visibilitychange", hideWhenBackgrounded)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", hideWhenBackgrounded)
    }
  }, [details])

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/sancus/cards/${card.id}/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Could not retrieve card details")
      setDetails(body.details as CardDetails)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not retrieve card details")
    } finally {
      setBusy(false)
    }
  }

  if (!details) {
    return (
      <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
        <button type="button" className="sx-btn sx-btn--secondary" onClick={reveal} disabled={busy || card.status !== "ACTIVE"}>
          {busy ? "Retrieving…" : "View card details"}
        </button>
        {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
      </div>
    )
  }

  const groupedPan = details.pan.replace(/(.{4})/g, "$1 ").trim()
  const expiration = `${details.expiration.slice(0, 2)}/${details.expiration.slice(2)}`
  return (
    <div className="rail-tile" style={{ display: "grid", gap: 10 }}>
      <div className="tile-head" style={{ margin: 0 }}>
        <strong>Card details</strong>
        <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => setDetails(null)}>Hide</button>
      </div>
      <div className="kv"><span>Card number</span><span className="data">{groupedPan}</span></div>
      <div className="kv"><span>Expiration</span><span className="data">{expiration}</span></div>
      <div className="kv"><span>Security code</span><span className="data">{details.cvv}</span></div>
      <span className="body-s muted">Sandbox credentials hide automatically after 60 seconds.</span>
    </div>
  )
}

function Usage({ card }: { card: Card }) {
  const used = Number(card.usedMinor)
  const limit = Number(card.monthlyLimitMinor)
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100))
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="kv"><span>Spent this month</span><span>{usd(used)} of {usd(limit)}</span></div>
      <div className="meter meter--held" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of monthly limit used`}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TapToPay({ card, onPaid }: { card: Card; onPaid: () => void }) {
  const [merchant, setMerchant] = useState(MERCHANTS[0]!)
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string; txHash?: string | null } | null>(null)

  async function pay() {
    const n = Number(amount)
    if (!(n > 0)) return setResult({ ok: false, text: "Enter an amount" })
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/sancus/my-card/purchases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, merchantName: merchant, amount: n }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Declined")
      setResult({ ok: true, text: `Approved: $${n.toFixed(2)} at ${merchant}.`, txHash: body.purchase?.txHash ?? null })
      setAmount("")
      onPaid()
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h2 className="sx-h heading-3" style={{ margin: 0 }}>Manual card pay</h2>
      <div className="filters" role="group" aria-label="Merchant">
        {MERCHANTS.map((m) => (
          <button key={m} type="button" className="chip" aria-pressed={merchant === m} onClick={() => setMerchant(m)}>
            {m}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Merchant</span>
          <input className="sx-field__input" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} />
        </label>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Amount (USD)</span>
          <input className="sx-field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="12.50" />
        </label>
      </div>
      <button type="button" className="sx-btn sx-btn--primary" onClick={pay} disabled={busy || card.status !== "ACTIVE" || !(Number(amount) > 0)} style={{ justifySelf: "start" }}>
        {busy ? "Authorising…" : `Pay ${Number(amount) > 0 ? `$${Number(amount).toFixed(2)}` : ""} with card ·${card.lastFour}`}
      </button>
      {result ? (
        <p className="body-s" role="status" style={{ margin: 0, color: result.ok ? "var(--settled)" : "var(--failed)" }}>
          {result.text}{" "}
          {result.txHash ? (
            <a href={`https://explorer.testnet.arc.io/tx/${result.txHash}`} target="_blank" rel="noreferrer">Settled on Arc</a>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

function IssueCard({ onIssued, compact = false }: { onIssued: (card: Card) => void; compact?: boolean }) {
  const [open, setOpen] = useState(!compact)
  const [label, setLabel] = useState(compact ? "Travel card" : "Virtual card")
  const [limit, setLimit] = useState("1000")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const key = useRef<string | null>(null)

  async function issue() {
    const n = Number(limit)
    if (!(n > 0)) return setError("Enter a monthly limit")
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sancus/my-card", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key.current },
        body: JSON.stringify({ label, monthlyLimit: n }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't issue the card")
      key.current = null
      setOpen(!compact)
      onIssued(body.card as Card)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
        + Add another card
      </button>
    )
  }
  return (
    <section className={compact ? undefined : "tile s12"} style={{ display: "grid", gap: 12 }}>
      {!compact ? (
        <>
          <h2 className="sx-h heading-3" style={{ margin: 0 }}>Get your virtual card</h2>
          <p className="body-s muted" style={{ margin: 0 }}>Issued instantly. Use it online or in a phone wallet; set a monthly limit you can change any time.</p>
        </>
      ) : null}
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Name on the card</span>
          <input className="sx-field__input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        </label>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Monthly limit (USD)</span>
          <input className="sx-field__input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} />
        </label>
      </div>
      <button type="button" className="sx-btn sx-btn--primary" style={{ justifySelf: "start" }} onClick={issue} disabled={busy}>
        {busy ? "Issuing…" : "Issue card"}
      </button>
      {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>{error}</p> : null}
    </section>
  )
}
