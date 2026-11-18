"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import type { Status } from "@/lib/sancus/demo-data"
import type { XenditPayoutDto, XenditRail } from "@/lib/sancus/xendit-payouts"

type RoutingType = "SWIFT" | "WALLET" | "MOBILE_NO" | "NATIONAL_ID"
type Preset = {
  label: string; country: string; currency: "THB" | "IDR" | "PHP"; amount: string;
  recipient: string; account: string; routingType: RoutingType; routingValue: string; hint: string
}

const presets: Record<XenditRail, Preset> = {
  PROMPTPAY: {
    label: "Thailand · PromptPay", country: "Thailand", currency: "THB", amount: "100",
    recipient: "Bangkok Demo Merchant", account: "66912345678", routingType: "MOBILE_NO",
    routingValue: "66912345678", hint: "PromptPay mobile without a leading +. Xendit only accepts letters and digits.",
  },
  BI_FAST: {
    label: "Indonesia · BI-FAST", country: "Indonesia", currency: "IDR", amount: "25000",
    recipient: "Jakarta Demo Merchant", account: "1234567890", routingType: "SWIFT",
    routingValue: "CENAIDJA", hint: "Bank account plus bank routing code. This is not an outbound QRIS payment.",
  },
  INSTAPAY: {
    label: "Philippines · InstaPay", country: "Philippines", currency: "PHP", amount: "500",
    recipient: "Manila Demo Merchant", account: "12345678", routingType: "SWIFT",
    routingValue: "BNORPHMM", hint: "Instant local payout to a Philippine bank or supported wallet.",
  },
  PESONET: {
    label: "Philippines · PESONet", country: "Philippines", currency: "PHP", amount: "75000",
    recipient: "Manila Demo Supplier", account: "87654321", routingType: "SWIFT",
    routingValue: "BNORPHMM", hint: "Same-day rail for payouts above InstaPay's limit.",
  },
}

function money(p: Pick<XenditPayoutDto, "currency" | "amountMinor">) {
  const decimals = p.currency === "IDR" ? 0 : 2
  const locale = p.currency === "THB" ? "th-TH" : p.currency === "IDR" ? "id-ID" : "en-PH"
  return new Intl.NumberFormat(locale, { style: "currency", currency: p.currency, maximumFractionDigits: decimals })
    .format(Number(p.amountMinor) / 10 ** decimals)
}

function pill(value: XenditPayoutDto["status"]): Status {
  return value === "SETTLED" ? "Settled" : value === "PENDING" || value === "COMPLIANCE_REVIEW" ? "Pending" : "Failed"
}

export function XenditPayoutDemo() {
  const [rail, setRail] = useState<XenditRail>("PROMPTPAY")
  const [recipientName, setRecipientName] = useState(presets.PROMPTPAY.recipient)
  const [accountNumber, setAccountNumber] = useState(presets.PROMPTPAY.account)
  const [routingType, setRoutingType] = useState<RoutingType>(presets.PROMPTPAY.routingType)
  const [routingValue, setRoutingValue] = useState(presets.PROMPTPAY.routingValue)
  const [amount, setAmount] = useState(presets.PROMPTPAY.amount)
  const [employeeName, setEmployeeName] = useState("Ana Souza")
  const [payouts, setPayouts] = useState<XenditPayoutDto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = useMemo(() => payouts[0] ?? null, [payouts])

  const load = useCallback(async () => {
    const response = await fetch("/api/sancus/xendit/payouts", { cache: "no-store" })
    if (!response.ok) return
    const body = (await response.json()) as { payouts?: XenditPayoutDto[] }
    setPayouts(body.payouts ?? [])
  }, [])
  useEffect(() => {
    // Initial server sync; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  function chooseRail(next: XenditRail) {
    const p = presets[next]
    setRail(next); setRecipientName(p.recipient); setAccountNumber(p.account)
    setRoutingType(p.routingType); setRoutingValue(p.routingValue); setAmount(p.amount); setError(null)
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/sancus/xendit/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          purpose: "EMPLOYEE_SPEND", employeeName, rail, recipientName, accountNumber,
          routingType, routingValue, amount: Number(amount), description: `${employeeName} · local merchant payment`,
        }),
      })
      const body = (await response.json()) as { payout?: XenditPayoutDto; error?: string }
      if (!response.ok || !body.payout) throw new Error(body.error || "Could not create Xendit payout")
      setPayouts((current) => [body.payout!, ...current.filter((p) => p.id !== body.payout!.id)])
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create payout") }
    finally { setBusy(false) }
  }

  async function refresh() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/sancus/xendit/payouts/${selected.id}/refresh`, { method: "POST" })
      const body = (await response.json()) as { payout?: XenditPayoutDto; error?: string }
      if (!response.ok || !body.payout) throw new Error(body.error || "Could not refresh payout")
      setPayouts((current) => current.map((p) => p.id === body.payout!.id ? body.payout! : p))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh payout") }
    finally { setBusy(false) }
  }

  const current = presets[rail]
  return (
    <section className="tile" aria-labelledby="xendit-outbound">
      <div className="tile-head">
        <div>
          <h2 className="tile-title" id="xendit-outbound">Use issued local-payment access</h2>
          <p className="body-s muted" style={{ margin: "4px 0 0" }}>A normal account is marked paid. Xendit is used only when the key is allowed to send money out.</p>
        </div>
        <span className="sx-pill sx-pill--simulated">Simulated</span>
      </div>
      <div className="filters" role="group" aria-label="Outbound local rail">
        {(Object.keys(presets) as XenditRail[]).map((id) => <button key={id} type="button" className="chip" aria-pressed={rail === id} onClick={() => chooseRail(id)}>{presets[id].label}</button>)}
      </div>
      <div className="grid" style={{ gap: 12, alignItems: "start" }}>
        <div className="s7" style={{ display: "grid", gap: 12 }}>
          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s6"><span className="sx-label">Employee using access</span><input className="sx-field__input" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Merchant / recipient</span><input className="sx-field__input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></label>
            <label className="sx-field s7"><span className="sx-label">Payment alias or account</span><input className="sx-field__input" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} /></label>
            <label className="sx-field s5"><span className="sx-label">Amount · {current.currency}</span><input className="sx-field__input sx-field__amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="sx-field s5"><span className="sx-label">Routing type</span><select className="sx-field__input" value={routingType} onChange={(e) => setRoutingType(e.target.value as RoutingType)}><option>SWIFT</option><option>WALLET</option><option>MOBILE_NO</option><option>NATIONAL_ID</option></select></label>
            <label className="sx-field s7"><span className="sx-label">Bank / wallet routing value</span><input className="sx-field__input" value={routingValue} onChange={(e) => setRoutingValue(e.target.value)} /></label>
          </div>
          <div className="tile-foot"><span className="body-s muted">{current.hint}</span><button type="button" className="sx-btn sx-btn--primary" disabled={busy || Number(amount) <= 0} onClick={create}>{busy ? "Working…" : `Pay via ${rail.replace("_", "-")}`}</button></div>
          <span className="body-s muted">Sandbox failure accounts: <span className="data">121212</span> invalid · <span className="data">999999</span> rejected · <span className="data">123456</span> temporary failure.</span>
          {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
        </div>
        <aside className="tile s5" style={{ minHeight: 240 }} aria-live="polite">
          {selected ? <>
            <div className="tile-head"><span className="sx-label">Xendit · {selected.rail.replace("_", "-")}</span><StatusPill status={pill(selected.status)} /></div>
            <strong>{selected.recipientName}</strong><span>{money(selected)}</span>
            <span className="body-s muted">{selected.employeeName || "Company admin"} · {selected.accountNumberMasked}</span>
            <span className="body-s muted">Provider: {selected.providerStatus}</span>
            <div className="tile-foot"><button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" disabled={busy} onClick={refresh}>Refresh status</button></div>
          </> : <div className="empty">Send a payout to see who was paid.</div>}
        </aside>
      </div>
    </section>
  )
}
