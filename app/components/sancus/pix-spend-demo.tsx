"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"
import type { PixPaymentDto, SpendingMethodDto } from "@/lib/sancus/local-rails"
import { useRegionalBalance } from "@/lib/sancus/use-regional-balance"

const brl = (minor: string) => `R$ ${(Number(minor) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`

export function PixSpendDemo() {
  const [methods, setMethods] = useState<SpendingMethodDto[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [qrPayload, setQrPayload] = useState("")
  const [amount, setAmount] = useState("25")
  const [recipient, setRecipient] = useState("Merchant from QR")
  const [resolved, setResolved] = useState(false)
  const [payment, setPayment] = useState<PixPaymentDto | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const regional = useRegionalBalance()
  const selected = useMemo(() => methods.find((method) => method.id === selectedId) ?? methods[0] ?? null, [methods, selectedId])

  const loadMethods = useCallback(async () => {
    const response = await fetch("/api/sancus/spending-methods", { cache: "no-store" })
    if (!response.ok) return
    const body = (await response.json()) as { methods?: SpendingMethodDto[] }
    setMethods(body.methods ?? [])
  }, [])
  useEffect(() => {
    // Initial server sync; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMethods()
  }, [loadMethods])

  const refreshPayment = useCallback(async (id: string) => {
    const response = await fetch(`/api/sancus/pix/payments/${id}/refresh`, { method: "POST" })
    const body = (await response.json()) as { payment?: PixPaymentDto; error?: string }
    if (!response.ok || !body.payment) throw new Error(body.error || "Could not refresh Pix payment")
    setPayment(body.payment)
    if (body.payment.status !== "PENDING") {
      await loadMethods()
      signalSancusDataChanged()
    }
  }, [loadMethods])

  const pollingPaymentId = payment?.status === "PENDING" ? payment.id : null
  useEffect(() => {
    if (!pollingPaymentId) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started >= 120_000) {
        window.clearInterval(timer)
        return
      }
      void refreshPayment(pollingPaymentId).catch(() => {})
    }, 3_000)
    return () => window.clearInterval(timer)
  }, [pollingPaymentId, refreshPayment])

  async function manage(action: "pause" | "resume" | "revoke" | "update_limit") {
    if (!selected) return
    const nextLimit = action === "update_limit" ? window.prompt("New monthly Pix limit in BRL", String(Number(selected.monthlyLimitMinor) / 100)) : null
    if (action === "update_limit" && !nextLimit) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/sancus/spending-methods/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, monthlyLimitBrl: nextLimit ? Number(nextLimit) : undefined }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not update Pix access")
      await loadMethods()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update Pix access") }
    finally { setBusy(false) }
  }

  async function resolve() {
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/sancus/pix/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrPayload }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not read Pix QR")
      setRecipient(body.recipientName)
      if (typeof body.amount === "number") setAmount(String(body.amount))
      setResolved(true)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read Pix QR") }
    finally { setBusy(false) }
  }

  async function pay() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/sancus/pix/payments", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ purpose: "EMPLOYEE_SPEND", spendingMethodId: selected.id, recipientName: recipient, amountBrl: Number(amount), qrPayload, description: `${selected.employeeName} · ${selected.label}` }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Pix payment failed")
      setPayment(body.payment)
      await loadMethods()
      if (body.payment.status !== "PENDING") signalSancusDataChanged()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Pix payment failed") }
    finally { setBusy(false) }
  }

  if (!selected) return <section className="tile"><div className="tile-head"><div><h2 className="tile-title">Employee Pix access</h2><p className="body-s muted">Issue Pix access to an employee before paying a merchant QR.</p></div><Link href="/team/ana/methods/new" className="sx-btn sx-btn--primary">Issue Pix access</Link></div></section>

  const active = selected.status === "ACTIVE"
  const pct = Math.min(100, Math.round(Number(selected.usedMinor) / Number(selected.monthlyLimitMinor) * 100))
  return <section className="tile" aria-labelledby="pix-spend-title">
    <div className="tile-head"><div><h2 className="tile-title" id="pix-spend-title">{selected.employeeName}&apos;s Pix access</h2><p className="body-s muted" style={{ margin: "4px 0 0" }}>{selected.label} · {brl(selected.usedMinor)} of {brl(selected.monthlyLimitMinor)} used{regional.balance ? ` · ${brl(regional.balance.availableMinor)} available` : ""}</p></div><span className={`sx-pill ${active ? "sx-pill--settled" : "sx-pill--failed"}`}>{selected.status}</span></div>
    {methods.length > 1 ? <label className="sx-field"><span className="sx-label">Spending method</span><select className="sx-field__input" value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>{methods.map((method) => <option key={method.id} value={method.id}>{method.employeeName} · {method.label}</option>)}</select></label> : null}
    <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
    <div className="tile-foot" style={{ justifyContent: "flex-start" }}><button className="sx-btn sx-btn--secondary sx-btn--sm" type="button" onClick={() => manage(active ? "pause" : "resume")} disabled={busy || selected.status === "REVOKED"}>{active ? "Pause" : "Resume"}</button><button className="sx-btn sx-btn--secondary sx-btn--sm" type="button" onClick={() => manage("update_limit")} disabled={busy || selected.status === "REVOKED"}>Edit limit</button><button className="sx-btn sx-btn--quiet sx-btn--sm" type="button" onClick={() => manage("revoke")} disabled={busy || selected.status === "REVOKED"}>Revoke</button></div>
    <label className="sx-field"><span className="sx-label">Pix copy-and-paste code</span><textarea className="sx-field__input" rows={3} value={qrPayload} onChange={(e) => { setQrPayload(e.target.value); setResolved(false) }} disabled={!active} /></label>
    <div className="grid" style={{ gap: 12 }}><label className="sx-field s7"><span className="sx-label">Recipient</span><input className="sx-field__input" value={recipient} readOnly /></label><label className="sx-field s5"><span className="sx-label">Amount · BRL</span><input className="sx-field__input sx-field__amount" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} disabled={!active} /></label></div>
    {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
    {payment ? <div className="kv"><span>{payment.recipientName} · {brl(payment.amountBrlMinor)} · {payment.simulated ? "Simulated" : "PayZu sandbox"}</span><StatusPill status={payment.status === "SETTLED" ? "Settled" : payment.status === "PENDING" ? "Pending" : "Failed"} /></div> : null}
    <div className="tile-foot"><span className="body-s muted">Issued by Sancus · PayZu sandbox underneath</span><span style={{ display: "flex", gap: 8 }}><button type="button" className="sx-btn sx-btn--secondary" onClick={resolve} disabled={busy || !active || qrPayload.length < 20}>Resolve QR</button><button type="button" className="sx-btn sx-btn--primary" onClick={pay} disabled={busy || !active || !resolved || Number(amount) <= 0}>{busy ? "Working…" : "Pay with Pix"}</button></span></div>
  </section>
}

