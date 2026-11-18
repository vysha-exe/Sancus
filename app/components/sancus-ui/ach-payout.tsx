"use client"

// Pay › US bank (ACH): add a US recipient, get a quote, send, and watch the (simulated) ACH
// timeline. Backed by /api/sancus/recipients and /api/sancus/payments; the same spending policy,
// approvals and ledger as every other Sancus payout.
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { notifyApprovalsChanged } from "@/lib/sancus/use-live-approvals"

type Recipient = {
  id: string
  name: string
  bankName: string
  routingNumber: string
  accountMasked: string
  accountType: "CHECKING" | "SAVINGS"
}
type Quote = {
  usdAmountMinor: string
  feeUsdMinor: string
  usdcAmountMinor: string
  etaLabel: string
  settlementMode: "MOCK_ONLY" | "TESTNET_SETTLEMENT"
}
type Policy = { decision: "ALLOW" | "NEEDS_APPROVAL" | "BLOCK"; reason: string | null }
type Step = { status: string; label: string; done: boolean; at: string | null }
type Payment = {
  id: string
  recipient: { name: string; bankName: string; accountMasked: string }
  speed: "STANDARD" | "SAME_DAY"
  usdAmountMinor: string
  feeUsdMinor: string
  usdcAmountMinor: string
  reference: string | null
  status: string
  returnCode: string | null
  failureReason: string | null
  approvalReason: string | null
  settlement: { mode: string; fundedOnchain: boolean; explorer: string | null }
  timeline: { label: string; eta: string; steps: Step[] }
  createdAt: string
}

const usd = (minor: string | bigint) =>
  `$${(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usdc = (minor: string) => `${(Number(minor) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "")

const STATUS: Record<string, { label: string; pill: string }> = {
  PENDING_APPROVAL: { label: "Waiting for approval", pill: "sx-pill--held" },
  CREATED: { label: "Quote locked", pill: "sx-pill--pending" },
  FUNDS_RECEIVED: { label: "USDC at partner", pill: "sx-pill--pending" },
  PAYMENT_SUBMITTED: { label: "ACH submitted", pill: "sx-pill--pending" },
  PAYMENT_PROCESSED: { label: "Delivered", pill: "sx-pill--settled" },
  FAILED: { label: "Failed · funds back", pill: "sx-pill--failed" },
  RETURNED: { label: "Returned", pill: "sx-pill--failed" },
  REJECTED: { label: "Declined", pill: "sx-pill--failed" },
}
const moving = (s: string) => ["CREATED", "FUNDS_RECEIVED", "PAYMENT_SUBMITTED", "PAYMENT_PROCESSED"].includes(s)
const DEV = process.env.NODE_ENV !== "production"

const emptyForm = { name: "", routingNumber: "", accountNumber: "", accountType: "CHECKING" as "CHECKING" | "SAVINGS" }

export function AchPayout() {
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading")
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [recipientId, setRecipientId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formIssues, setFormIssues] = useState<Record<string, string>>({})
  const [amount, setAmount] = useState("250.00")
  const [speed, setSpeed] = useState<"STANDARD" | "SAME_DAY">("STANDARD")
  const [reference, setReference] = useState("")
  const [quote, setQuote] = useState<{ quote: Quote; policy: Policy } | null>(null)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([fetch("/api/sancus/recipients", { cache: "no-store" }), fetch("/api/sancus/payments", { cache: "no-store" })])
      if (r.status === 401 || p.status === 401) return setState("signed-out")
      const [rb, pb] = await Promise.all([r.json(), p.json()])
      if (!r.ok || !p.ok) throw new Error()
      setRecipients(rb.recipients)
      setPayments(pb.payments)
      setRecipientId((cur) => cur ?? rb.recipients[0]?.id ?? null)
      setAdding((cur) => cur || rb.recipients.length === 0)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const active = useMemo(() => payments.find((p) => p.id === activeId) ?? payments[0] ?? null, [payments, activeId])

  // Poll while the shown payment is still moving (the mock provider advances on read).
  const activeMoving = active ? moving(active.status) && !(active.status === "PAYMENT_PROCESSED" && !active.recipient.accountMasked.endsWith("0002")) : false
  useEffect(() => {
    if (!active || !activeMoving) return
    const id = active.id
    const t = setInterval(async () => {
      const res = await fetch(`/api/sancus/payments/${id}`, { cache: "no-store" })
      if (!res.ok) return
      const body = await res.json()
      setPayments((prev) => prev.map((p) => (p.id === id ? body.payment : p)))
    }, 1500)
    return () => clearInterval(t)
  }, [active, activeMoving])

  // Live quote, debounced.
  const amountValid = /^\d+(\.\d{1,2})?$/.test(amount.replace(/,/g, "")) && Number(amount.replace(/,/g, "")) > 0
  useEffect(() => {
    if (!recipientId || !amountValid) return
    const controller = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/sancus/payments/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId, usdAmount: amount.replace(/,/g, ""), speed }),
          signal: controller.signal,
        })
        const body = await res.json()
        if (res.ok) {
          setQuote({ quote: body.quote, policy: body.policy })
          setQuoteError(null)
        } else {
          setQuote(null)
          setQuoteError(body.error ?? "Couldn't get a quote")
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setQuoteError("Couldn't reach the server")
      }
    }, 350)
    return () => {
      controller.abort()
      clearTimeout(t)
    }
  }, [recipientId, amount, speed, amountValid])

  async function addRecipient(e: React.FormEvent) {
    e.preventDefault()
    setBusy("recipient")
    setFormIssues({})
    setError(null)
    try {
      const res = await fetch("/api/sancus/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ownerType: "BUSINESS" }),
      })
      const body = await res.json()
      if (!res.ok) {
        const issues: Record<string, string> = {}
        for (const i of body.issues ?? []) issues[i.field] = i.message
        setFormIssues(issues)
        if (!body.issues?.length) setError(body.error ?? "Couldn't save the recipient")
        return
      }
      setRecipients((prev) => (prev.some((r) => r.id === body.recipient.id) ? prev : [body.recipient, ...prev]))
      setRecipientId(body.recipient.id)
      setAdding(false)
      setForm(emptyForm)
    } catch {
      setError("Couldn't reach the server")
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    if (!recipientId || !quote) return
    setBusy("send")
    setError(null)
    try {
      const res = await fetch("/api/sancus/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ recipientId, usdAmount: amount.replace(/,/g, ""), speed, reference: reference.trim() || undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "The payment didn't go through")
      setPayments((prev) => [body.payment, ...prev.filter((p) => p.id !== body.payment.id)])
      setActiveId(body.payment.id)
      if (body.needsApproval) notifyApprovalsChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function simulate(outcome: "fail" | "return") {
    if (!active) return
    setBusy(outcome)
    setError(null)
    try {
      const res = await fetch(`/api/sancus/dev/ach/${active.id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      })
      const body = await res.json()
      if (body.payment) setPayments((prev) => prev.map((p) => (p.id === active.id ? body.payment : p)))
      if (body.webhook?.applied === false) setError(body.webhook.note ?? "The provider ignored that event")
      else if (!res.ok) setError(body.error ?? "Simulation failed")
    } catch {
      setError("Couldn't reach the server")
    } finally {
      setBusy(null)
    }
  }

  if (state === "signed-out") return <div className="tile s12"><div className="empty">Sign in to pay US bank accounts.</div></div>
  if (state === "error") return <div className="tile s12"><div className="empty">Couldn&apos;t load US payouts. Refresh to try again.</div></div>

  const selected = recipients.find((r) => r.id === recipientId) ?? null
  const decision = quote?.policy.decision
  const field = (k: keyof typeof emptyForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="sx-field">
      <span className="sx-label">{label}</span>
      <input
        className="sx-field__input"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
        aria-invalid={Boolean(formIssues[k])}
        {...props}
      />
      {formIssues[k] ? (
        <span className="sx-field__help" style={{ color: "var(--danger, #c0392b)" }}>
          {formIssues[k]}
        </span>
      ) : null}
    </label>
  )

  return (
    <div className="grid">
      <section className="tile s7" aria-labelledby="ach-send">
        <div className="tile-head">
          <h2 className="tile-title" id="ach-send">
            Send USD to a US bank
          </h2>
          <span className="sx-pill sx-pill--simulated">ACH · simulated</span>
        </div>

        {/* 1. Recipient */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="sx-label">1 · Recipient</span>
            {recipients.length ? (
              <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => setAdding((a) => !a)}>
                {adding ? "Pick a saved one" : "+ New US recipient"}
              </button>
            ) : null}
          </div>
          {adding ? (
            <form onSubmit={addRecipient} style={{ display: "grid", gap: 10 }}>
              {field("name", "Account holder", { placeholder: "Acme Supply Co", autoComplete: "off" })}
              <div className="grid" style={{ gap: 10 }}>
                <div className="s6">{field("routingNumber", "Routing number", { inputMode: "numeric", placeholder: "9 digits, e.g. 021000021" })}</div>
                <div className="s6">{field("accountNumber", "Account number", { inputMode: "numeric", placeholder: "4–17 digits", autoComplete: "off" })}</div>
              </div>
              <div className="filters" role="group" aria-label="Account type">
                {(["CHECKING", "SAVINGS"] as const).map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={form.accountType === t} onClick={() => setForm({ ...form, accountType: t })}>
                    {t === "CHECKING" ? "Checking" : "Savings"}
                  </button>
                ))}
              </div>
              <div className="tile-foot">
                <span className="body-s muted">We check the routing number and keep only the last 4 digits.</span>
                <button type="submit" className="sx-btn sx-btn--secondary" disabled={busy !== null}>
                  {busy === "recipient" ? "Checking…" : "Verify and save"}
                </button>
              </div>
            </form>
          ) : (
            <div role="radiogroup" aria-label="US recipients" style={{ display: "grid", gap: 8 }}>
              {recipients.map((r) => {
                const on = r.id === recipientId
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`pick${on ? " pick--on" : ""}`}
                    onClick={() => setRecipientId(r.id)}
                    style={{ width: "100%", textAlign: "left" }}
                  >
                    <span className="av">{r.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}</span>
                    <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                      <span className="body-strong trunc">{r.name}</span>
                      <span className="body-s trunc">
                        {r.bankName} · {r.accountType === "CHECKING" ? "Checking" : "Savings"} {r.accountMasked}
                      </span>
                    </span>
                    <span className="sx-rail">ACH</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 2. Amount */}
        {!adding && selected ? (
          <div style={{ display: "grid", gap: 10, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <span className="sx-label">2 · Amount</span>
            <div className="grid" style={{ gap: 10 }}>
              <label className="sx-field s7">
                <span className="sx-label">They receive (USD)</span>
                <input className="sx-field__input sx-field__amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <label className="sx-field s5">
                <span className="sx-label">Reference (optional)</span>
                <input className="sx-field__input" maxLength={80} placeholder="INV-2041" value={reference} onChange={(e) => setReference(e.target.value)} />
              </label>
            </div>
            <div className="filters" role="group" aria-label="Speed">
              <button type="button" className="chip" aria-pressed={speed === "STANDARD"} onClick={() => setSpeed("STANDARD")}>
                Standard ACH · $0.50
              </button>
              <button type="button" className="chip" aria-pressed={speed === "SAME_DAY"} onClick={() => setSpeed("SAME_DAY")}>
                Same-day ACH · $1.00
              </button>
            </div>

            {quote && amountValid ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div className="kv">
                  <span>{selected.name} receives</span>
                  <span className="body-strong">{usd(quote.quote.usdAmountMinor)}</span>
                </div>
                <div className="kv">
                  <span>ACH fee</span>
                  <span>{usd(quote.quote.feeUsdMinor)}</span>
                </div>
                <div className="kv">
                  <span>From your Treasury</span>
                  <span className="body-strong">{usdc(quote.quote.usdcAmountMinor)}</span>
                </div>
                <div className="kv">
                  <span>Rate</span>
                  <span>1 USDC = 1 USD</span>
                </div>
                <span className="body-s muted">{quote.quote.etaLabel}</span>
                <span className="body-s muted">
                  Settlement: {quote.quote.settlementMode === "TESTNET_SETTLEMENT" ? "real Arc testnet USDC to the settlement wallet, then simulated ACH" : "fully simulated (no blockchain transaction)"}
                </span>
                {decision === "NEEDS_APPROVAL" ? (
                  <span className="body-s" role="status">Needs approval: {quote.policy.reason}</span>
                ) : decision === "BLOCK" ? (
                  <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
                    Blocked: {quote.policy.reason}
                  </span>
                ) : null}
              </div>
            ) : quoteError ? (
              <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
                {quoteError}
              </span>
            ) : null}

            <div className="tile-foot">
              <span className="body-s muted">Same policy, approvals and ledger as every payout</span>
              <button
                type="button"
                className="sx-btn sx-btn--primary"
                onClick={send}
                disabled={!quote || !amountValid || decision === "BLOCK" || busy !== null}
              >
                {busy === "send" ? "Sending…" : decision === "NEEDS_APPROVAL" ? "Send for approval" : `Send ${quote ? usd(quote.quote.usdAmountMinor) : ""}`}
              </button>
            </div>
          </div>
        ) : null}
        {error ? (
          <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
            {error}
          </span>
        ) : null}
      </section>

      <aside className="tile s5" aria-labelledby="ach-track">
        <div className="tile-head">
          <h2 className="tile-title" id="ach-track">
            Tracking
          </h2>
          {active ? <span className={`sx-pill ${STATUS[active.status]?.pill ?? ""}`}>{STATUS[active.status]?.label ?? active.status}</span> : null}
        </div>
        {state === "loading" ? (
          <div className="empty">Loading…</div>
        ) : !active ? (
          <div className="empty">Your US payouts will show up here with each step.</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 2 }}>
              <span className="body-strong">
                {usd(active.usdAmountMinor)} to {active.recipient.name}
              </span>
              <span className="body-s muted">
                {active.recipient.bankName} {active.recipient.accountMasked} · {active.speed === "SAME_DAY" ? "Same-day ACH" : "Standard ACH"}
                {active.reference ? ` · ${active.reference}` : ""}
              </span>
            </div>
            <span className="sx-pill sx-pill--simulated" style={{ justifySelf: "start" }}>
              {active.timeline.label}
            </span>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
              {(active.status === "PENDING_APPROVAL"
                ? [{ status: "PENDING_APPROVAL", label: "Waiting for an approver", done: false, at: null }, ...active.timeline.steps]
                : active.timeline.steps
              ).map((s) => {
                const bad = s.status === "FAILED" || s.status === "RETURNED"
                return (
                  <li key={s.status} style={{ display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, alignItems: "center" }}>
                    <span
                      aria-hidden
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 99,
                        background: bad ? "var(--danger, #c0392b)" : s.done ? "var(--accent, #1f7a4d)" : "transparent",
                        border: `2px solid ${bad ? "var(--danger, #c0392b)" : s.done ? "var(--accent, #1f7a4d)" : "var(--line, #ccc)"}`,
                      }}
                    />
                    <span className={s.done ? "body-s" : "body-s muted"}>{s.label}</span>
                    <span className="body-s muted">{s.done ? time(s.at) : ""}</span>
                  </li>
                )
              })}
            </ol>
            <span className="body-s muted">{active.timeline.eta}</span>
            {active.status === "PENDING_APPROVAL" ? (
              <span className="body-s">
                {active.approvalReason}.{" "}
                <Link href="/activity/approvals">Approve it in Approvals</Link>
              </span>
            ) : null}
            {active.failureReason ? <span className="body-s">{active.failureReason}</span> : null}
            {active.status === "FAILED" || active.status === "RETURNED" ? (
              <span className="body-s muted">
                {active.settlement.fundedOnchain
                  ? "USDC already left onchain, so the ledger records a refund owed by the partner."
                  : "No USDC left the Treasury; the reserved funds were released."}
              </span>
            ) : null}
            {active.settlement.explorer ? (
              <a className="body-s" href={active.settlement.explorer} target="_blank" rel="noreferrer">
                USDC settlement tx on Arc
              </a>
            ) : null}
            {DEV && ["FUNDS_RECEIVED", "PAYMENT_SUBMITTED", "CREATED"].includes(active.status) ? (
              <div className="tile-foot" style={{ justifyContent: "flex-start" }}>
                <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => simulate("fail")} disabled={busy !== null}>
                  {busy === "fail" ? "Failing…" : "Simulate failure (R03)"}
                </button>
              </div>
            ) : null}
            {DEV && active.status === "PAYMENT_PROCESSED" ? (
              <div className="tile-foot" style={{ justifyContent: "flex-start" }}>
                <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => simulate("return")} disabled={busy !== null}>
                  {busy === "return" ? "Returning…" : "Simulate bank return (R01)"}
                </button>
              </div>
            ) : null}

            {payments.length > 1 ? (
              <div style={{ display: "grid", gap: 6, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                <span className="sx-label">Recent</span>
                {payments.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className="sx-btn sx-btn--quiet sx-btn--sm"
                    style={{ display: "flex", justifyContent: "space-between", width: "100%", fontWeight: p.id === active.id ? 600 : 400 }}
                  >
                    <span className="trunc">
                      {usd(p.usdAmountMinor)} · {p.recipient.name}
                    </span>
                    <span className="muted">{STATUS[p.status]?.label ?? p.status}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
        <details className="body-s muted">
          <summary>Test values</summary>
          Account ending <b>0001</b> fails at submission · ending <b>0002</b> settles then is returned (R01) · amount <b>$13.13</b> fails ·
          $1,000+ needs approval. Try routing 021000021 (Chase) or 121000248 (Wells Fargo).
        </details>
      </aside>
    </div>
  )
}
