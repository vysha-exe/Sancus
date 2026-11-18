"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import type { Status } from "@/lib/sancus/demo-data"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"
import type { CollectionDto, CollectionRail } from "@/lib/sancus/local-rails"
import type { CompanyNode } from "@/lib/sancus/companies"
import { useWorkspace } from "@/lib/sancus/use-workspace"

const railInfo: Record<CollectionRail, { label: string; currency: string; note: string }> = {
  QRIS: { label: "QRIS", currency: "IDR", note: "Pay with the Midtrans QRIS simulator." },
  PROMPTPAY: { label: "PromptPay", currency: "THB", note: "Mark the charge successful in Omise test mode." },
  PIX: { label: "Pix", currency: "BRL", note: "PayZu sandbox settles automatically after about 10 seconds." },
}

function flatten(nodes: CompanyNode[]): CompanyNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

const money = (currency: string, minor: string) => new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : currency === "IDR" ? "id-ID" : "th-TH", {
  style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2,
}).format(Number(minor) / (currency === "IDR" ? 1 : 100))

function status(value: CollectionDto["status"]): Status {
  return value === "SETTLED" ? "Settled" : value === "PENDING" ? "Pending" : "Failed"
}

export function CollectionDemo() {
  const workspace = useWorkspace()
  const [rail, setRail] = useState<CollectionRail>("PIX")
  const [amount, setAmount] = useState("")
  const [branchId, setBranchId] = useState("")
  const [reference, setReference] = useState("")
  const [collections, setCollections] = useState<CollectionDto[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eligibleBranches = useMemo(() => flatten(workspace.tree).filter((node) => node.parentId !== null && node.currency === railInfo[rail].currency), [rail, workspace.tree])
  const receivingBranch = eligibleBranches.find((node) => node.id === branchId) ?? eligibleBranches[0] ?? null
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
    setAmount("")
    setBranchId("")
    setError(null)
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const response = await fetch("/api/sancus/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ rail, amount: Number(amount), companyId: receivingBranch?.id, reference: reference || undefined }),
      })
      const body = (await response.json()) as { collection?: CollectionDto; error?: string }
      if (!response.ok || !body.collection) throw new Error(body.error || "Could not create collection")
      setCollections((current) => [body.collection!, ...current.filter((c) => c.id !== body.collection!.id)])
      setSelectedId(body.collection.id)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create collection") }
    finally { setBusy(false) }
  }

  const refresh = useCallback(async (id: string, quiet = false) => {
    if (!quiet) { setBusy(true); setError(null) }
    try {
      const response = await fetch(`/api/sancus/collections/${id}/refresh`, { method: "POST" })
      const body = (await response.json()) as { collection?: CollectionDto; error?: string }
      if (!response.ok || !body.collection) throw new Error(body.error || "Could not refresh collection")
      setCollections((current) => current.map((c) => c.id === body.collection!.id ? { ...body.collection!, companyName: body.collection!.companyName ?? c.companyName } : c))
      if (body.collection.status !== "PENDING") signalSancusDataChanged()
    } catch (caught) {
      if (!quiet) setError(caught instanceof Error ? caught.message : "Could not refresh collection")
    } finally {
      if (!quiet) setBusy(false)
    }
  }, [])

  const pollingCollectionId = selected?.status === "PENDING" ? selected.id : null
  useEffect(() => {
    if (!pollingCollectionId) return
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - started >= 120_000) {
        window.clearInterval(timer)
        return
      }
      void refresh(pollingCollectionId, true)
    }, 3_000)
    return () => window.clearInterval(timer)
  }, [pollingCollectionId, refresh])

  return (
    <section className="tile s12" aria-labelledby="local-collections">
      <div className="tile-head">
        <div><h2 className="tile-title" id="local-collections">Create a local QR collection</h2><p className="body-s muted" style={{ margin: "4px 0 0" }}>The customer scans an exact-amount QR and pays the selected branch in its local currency.</p></div>
        <span className={`sx-pill${selected?.simulated ? " sx-pill--simulated" : ""}`}>{selected?.simulated ? "Simulated" : "Provider sandbox"}</span>
      </div>
      <div className="grid" style={{ alignItems: "start" }}>
        <div className="s7" style={{ display: "grid", gap: 12 }}>
          <div className="filters" role="group" aria-label="Collection rail">
            {(Object.keys(railInfo) as CollectionRail[]).map((id) => <button key={id} type="button" className="chip" aria-pressed={rail === id} onClick={() => changeRail(id)}>{railInfo[id].label}</button>)}
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s6"><span className="sx-label">Amount customer pays · {railInfo[rail].currency}</span><input className="sx-field__input sx-field__amount" value={amount} inputMode="decimal" placeholder="0" onChange={(e) => setAmount(e.target.value)} /><span className="sx-field__help">Encoded in the QR so the customer pays the correct total.</span></label>
            <label className="sx-field s6"><span className="sx-label">Receiving branch</span><select className="sx-field__input" value={receivingBranch?.id ?? ""} onChange={(e) => setBranchId(e.target.value)} disabled={!eligibleBranches.length}><option value="" disabled>{eligibleBranches.length ? "Choose a branch" : `No ${railInfo[rail].currency} branch available`}</option>{eligibleBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><span className="sx-field__help">This branch receives and owns the payment.</span></label>
            <label className="sx-field s12"><span className="sx-label">Invoice or order number (optional)</span><input className="sx-field__input" value={reference} onChange={(e) => setReference(e.target.value)} /><span className="sx-field__help">Your identifier for matching the payment in activity and reconciliation.</span></label>
          </div>
          <div className="tile-foot"><span className="body-s muted">{railInfo[rail].note}</span><button type="button" className="sx-btn sx-btn--primary" disabled={busy || Number(amount) <= 0 || !receivingBranch} onClick={create}>{busy ? "Working…" : `Create ${railInfo[rail].label} QR`}</button></div>
          {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
          {collections.length ? <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Rail</th><th>Receiving branch</th><th className="num">Amount</th><th>Status</th></tr></thead><tbody>{collections.slice(0, 6).map((c) => <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(c.id)}><td><span className="sx-rail">{c.rail}</span></td><td>{c.companyName || "Unassigned"}</td><td className="num">{money(c.currency, c.amountLocalMinor)}</td><td><StatusPill status={status(c.status)} /></td></tr>)}</tbody></table></div> : null}
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
            <span className="body-s muted">Paid to {selected.companyName || "an unassigned legacy collection"}</span>
            {selected.reference ? <span className="body-s muted">Invoice or order number · {selected.reference}</span> : null}
            <div className="tile-foot" style={{ justifyContent: "flex-start" }}>{selected.simulatorUrl ? <a className="sx-btn sx-btn--primary sx-btn--sm" href={selected.simulatorUrl} target="_blank" rel="noreferrer">Open provider simulator</a> : null}<button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => refresh(selected.id)} disabled={busy}>Refresh status</button></div>
          </> : <div className="empty">Create a collection to show its provider-generated QR.</div>}
        </aside>
      </div>
    </section>
  )
}
