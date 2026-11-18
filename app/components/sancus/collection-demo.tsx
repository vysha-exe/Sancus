"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import type { Status } from "@/lib/sancus/demo-data"
import type { CollectionDto, CollectionRail } from "@/lib/sancus/local-rails"

const railInfo: Record<CollectionRail, { label: string; currency: string; defaultAmount: string; note: string }> = {
  QRIS: { label: "QRIS", currency: "IDR", defaultAmount: "25000", note: "Pay with the Midtrans QRIS simulator." },
  PROMPTPAY: { label: "PromptPay", currency: "THB", defaultAmount: "100", note: "Mark the charge successful in Omise test mode." },
  PIX: { label: "Pix", currency: "BRL", defaultAmount: "10", note: "PayZu sandbox settles automatically after about 10 seconds." },
}

const money = (currency: string, minor: string) => new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : currency === "IDR" ? "id-ID" : "th-TH", {
  style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2,
}).format(Number(minor) / (currency === "IDR" ? 1 : 100))

function status(value: CollectionDto["status"]): Status {
  return value === "SETTLED" ? "Settled" : value === "PENDING" ? "Pending" : "Failed"
}

export function CollectionDemo() {
  const [rail, setRail] = useState<CollectionRail>("QRIS")
  const [amount, setAmount] = useState(railInfo.QRIS.defaultAmount)
  const [customerName, setCustomerName] = useState("Demo customer")
  const [reference, setReference] = useState("INV-1042")
  const [collections, setCollections] = useState<CollectionDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = useMemo(() => collections.find((c) => c.id === selectedId) ?? collections[0] ?? null, [collections, selectedId])

  const load = useCallback(async () => {
    const response = await fetch("/api/sancus/collections", { cache: "no-store" })
    if (!response.ok) return
    const body = (await response.json()) as { collections?: CollectionDto[] }
    setCollections(body.collections ?? [])
  }, [])
  useEffect(() => {
    // Initial server sync; the state change happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  function changeRail(next: CollectionRail) {
    setRail(next)
    setAmount(railInfo[next].defaultAmount)
    setError(null)
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/sancus/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ rail, amount: Number(amount), customerName, reference }),
      })
      const body = (await response.json()) as { collection?: CollectionDto; error?: string }
      if (!response.ok || !body.collection) throw new Error(body.error || "Could not create collection")
      setCollections((current) => [body.collection!, ...current.filter((c) => c.id !== body.collection!.id)])
      setSelectedId(body.collection.id)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create collection") }
    finally { setBusy(false) }
  }

  async function refresh() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const response = await fetch(`/api/sancus/collections/${selected.id}/refresh`, { method: "POST" })
      const body = (await response.json()) as { collection?: CollectionDto; error?: string }
      if (!response.ok || !body.collection) throw new Error(body.error || "Could not refresh collection")
      setCollections((current) => current.map((c) => c.id === body.collection!.id ? body.collection! : c))
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh collection") }
    finally { setBusy(false) }
  }

  return (
    <section className="tile s12" aria-labelledby="local-collections">
      <div className="tile-head">
        <div><h2 className="tile-title" id="local-collections">Create a local QR collection</h2><p className="body-s muted" style={{ margin: "4px 0 0" }}>Provider-backed sandbox charges for customers paying your company.</p></div>
        <span className="sx-pill sx-pill--simulated">Sandbox collection</span>
      </div>
      <div className="grid" style={{ alignItems: "start" }}>
        <div className="s7" style={{ display: "grid", gap: 12 }}>
          <div className="filters" role="group" aria-label="Collection rail">
            {(Object.keys(railInfo) as CollectionRail[]).map((id) => <button key={id} type="button" className="chip" aria-pressed={rail === id} onClick={() => changeRail(id)}>{railInfo[id].label}</button>)}
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s6"><span className="sx-label">Amount · {railInfo[rail].currency}</span><input className="sx-field__input sx-field__amount" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Customer</span><input className="sx-field__input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></label>
            <label className="sx-field s12"><span className="sx-label">Reference</span><input className="sx-field__input" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          </div>
          <div className="tile-foot"><span className="body-s muted">{railInfo[rail].note}</span><button type="button" className="sx-btn sx-btn--primary" disabled={busy || Number(amount) <= 0} onClick={create}>{busy ? "Working…" : `Create ${railInfo[rail].label} QR`}</button></div>
          {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
          {collections.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rail</th><th>Customer</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>{collections.slice(0, 6).map((c) => <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(c.id)}><td><span className="sx-rail">{c.rail}</span></td><td>{c.customerName || "Customer"}</td><td className="num">{money(c.currency, c.amountLocalMinor)}</td><td><StatusPill status={status(c.status)} /></td></tr>)}</tbody></table></div> : null}
        </div>
        <aside className="tile s5" style={{ minHeight: 270 }} aria-live="polite">
          {selected ? <>
            <div className="tile-head"><span className="sx-label">{selected.provider} · {selected.rail}</span><StatusPill status={status(selected.status)} /></div>
            {selected.qrImageUrl ? <>
              {/* Provider-generated sandbox QR; its host is dynamic per rail. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.qrImageUrl} alt={`${selected.rail} collection QR`} width={168} height={168} style={{ background: "white", borderRadius: 8, padding: 6, alignSelf: "center" }} />
            </> : <div className="empty">QR payload is ready to copy.</div>}
            <strong>{money(selected.currency, selected.amountLocalMinor)}</strong>
            <span className="body-s muted">{selected.reference}</span>
            <div className="tile-foot" style={{ justifyContent: "flex-start" }}>{selected.simulatorUrl ? <a className="sx-btn sx-btn--primary sx-btn--sm" href={selected.simulatorUrl} target="_blank" rel="noreferrer">Open provider simulator</a> : null}<button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={refresh} disabled={busy}>Refresh status</button></div>
          </> : <div className="empty">Create a collection to show its provider-generated QR.</div>}
        </aside>
      </div>
    </section>
  )
}

