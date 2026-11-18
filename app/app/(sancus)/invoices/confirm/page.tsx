"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { INVOICE_PAY_STORAGE_KEY, type InvoiceDto, type InvoicePayContext } from "@/lib/sancus/invoices"

function ConfirmInner() {
  const params = useSearchParams()
  const router = useRouter()
  const id = params.get("id")
  const [fileName, setFileName] = useState(params.get("file") || "Uploaded invoice")
  const [loading, setLoading] = useState(Boolean(id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [paid, setPaid] = useState(false)
  const [supplier, setSupplier] = useState("")
  const [invoice, setInvoice] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [due, setDue] = useState("")
  const [rail, setRail] = useState("ACH")
  const [iban, setIban] = useState("")
  const [bic, setBic] = useState("")
  const amountValue = useMemo(() => Number(amount.replace(/,/g, "")), [amount])
  const amountLabel = useMemo(() => Number.isFinite(amountValue) && amountValue > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountValue) : "—", [amountValue, currency])
  const ready = Boolean(id) && !paid && supplier.trim().length > 0 && invoice.trim().length > 0 && amountLabel !== "—"

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/sancus/invoices/${id}`, { cache: "no-store" })
        const body = (await res.json().catch(() => ({}))) as { invoice?: InvoiceDto; error?: string }
        if (cancelled) return
        if (!res.ok || !body.invoice) {
          setError(res.status === 404 ? "We couldn't find that invoice." : res.status === 401 ? "Sign in to review this invoice." : body.error ?? "Could not load the invoice.")
          return
        }
        const found = body.invoice
        setFileName(found.fileName)
        setSupplier(found.supplierName ?? "")
        setInvoice(found.invoiceNumber ?? "")
        setAmount(found.amount !== null ? String(found.amount) : "")
        setCurrency(found.currency)
        setDue(found.dueDate ?? "")
        setRail(found.rail ?? "ACH")
        setPaid(found.status === "PAID")
      } catch {
        if (!cancelled) setError("Could not reach Sancus. Try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  async function save(): Promise<InvoiceDto | null> {
    const res = await fetch(`/api/sancus/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierName: supplier.trim(), invoiceNumber: invoice.trim() || null, amount: amountValue, currency, dueDate: due || null, rail }),
    })
    const body = (await res.json().catch(() => ({}))) as { invoice?: InvoiceDto; error?: string; issues?: { message: string }[] }
    if (!res.ok || !body.invoice) {
      setError(body.issues?.[0]?.message ?? body.error ?? "Could not save the invoice.")
      return null
    }
    return body.invoice
  }

  async function onSave() {
    setBusy(true); setError(null); setSaved(false)
    try { if (await save()) setSaved(true) } catch { setError("Could not reach Sancus. Try again.") } finally { setBusy(false) }
  }

  async function onContinue() {
    if (!ready) return
    setBusy(true); setError(null)
    try {
      const updated = await save()
      if (!updated) return
      // Sandbox: continuing marks the invoice paid and hands its details to the pay flow.
      const res = await fetch(`/api/sancus/invoices/${id}/pay`, { method: "POST" })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? "Could not mark the invoice paid.")
        return
      }
      const context: InvoicePayContext = { invoiceId: updated.id, supplier: supplier.trim(), amount: amountValue, currency, invoiceNumber: invoice.trim() || null }
      sessionStorage.setItem(INVOICE_PAY_STORAGE_KEY, JSON.stringify(context))
      router.push(`/pay?invoiceId=${updated.id}`)
    } catch {
      setError("Could not reach Sancus. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!id) {
    return (
      <div className="page">
        <header className="page-head flowhead"><div className="title"><Link href="/invoices" className="icon-btn" aria-label="Back to Invoices">←</Link><h1 className="sx-h heading-2">Confirm invoice</h1></div></header>
        <div className="tile empty">Upload an invoice first. <Link href="/invoices">Go to Invoices</Link></div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head flowhead"><div className="title"><Link href="/invoices" className="icon-btn" aria-label="Back to Invoices">←</Link><h1 className="sx-h heading-2">Confirm invoice</h1></div><ol className="steps" aria-label="Pay an invoice"><li className="done">1 Upload</li><li aria-current="step">2 Confirm</li><li>3 Pay</li></ol></header>
      {error ? <div className="tile s12" role="alert" style={{ marginBottom: 16 }}><span className="body-s" style={{ color: "var(--danger, #c0392b)" }}>{error}</span></div> : null}
      <div className="grid">
        <section className="tile s7" aria-labelledby="read">
          <div className="tile-head"><h2 className="tile-title" id="read">Review {fileName}</h2><span className="sx-pill">{loading ? "Reading…" : paid ? "Paid" : "Review required"}</span></div>
          <div className="grid" style={{ gap: 14 }}>
            <label className="sx-field s6"><span className="sx-label">Supplier</span><input className="sx-field__input" value={supplier} disabled={loading || paid} onChange={(e) => setSupplier(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Invoice or order number</span><input className="sx-field__input" value={invoice} disabled={loading || paid} onChange={(e) => setInvoice(e.target.value)} /><span className="sx-field__help">Used to match this payment to the supplier&apos;s invoice in activity and reconciliation.</span></label>
            <label className="sx-field s6"><span className="sx-label">Amount</span><input className="sx-field__input" inputMode="decimal" value={amount} disabled={loading || paid} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Currency</span><select className="sx-field__input" value={currency} disabled={loading || paid} onChange={(e) => setCurrency(e.target.value)}><option value="USD">USD · US dollar</option><option value="EUR">EUR · euro</option><option value="BRL">BRL · real</option><option value="IDR">IDR · rupiah</option><option value="THB">THB · baht</option></select></label>
            <label className="sx-field s6"><span className="sx-label">Due date</span><input className="sx-field__input" type="date" value={due} disabled={loading || paid} onChange={(e) => setDue(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Pay by</span><select className="sx-field__input" value={rail} disabled={loading || paid} onChange={(e) => setRail(e.target.value)}><option value="ACH">ACH</option><option value="SEPA">SEPA transfer</option><option value="WIRE">Wire transfer</option><option value="USDC">USDC</option><option value="PIX">Pix</option></select></label>
            {rail === "SEPA" ? <><label className="sx-field s12"><span className="sx-label">IBAN</span><input className="sx-field__input" value={iban} onChange={(e) => setIban(e.target.value)} /></label><label className="sx-field s6"><span className="sx-label">BIC</span><input className="sx-field__input" value={bic} onChange={(e) => setBic(e.target.value)} /></label></> : null}
          </div>
          <div className="tile-foot"><span className="body-s muted">{saved ? "Saved." : "Check these details against the uploaded invoice."}</span><span style={{ display: "flex", gap: 8 }}><button type="button" className="sx-btn sx-btn--secondary" disabled={busy || loading || paid} onClick={() => void onSave()}>Save</button><button type="button" className="sx-btn sx-btn--quiet" onClick={() => router.push("/invoices")}>Upload a different file</button></span></div>
        </section>
        <section className="tile s5" aria-labelledby="sum">
          <div className="empty" style={{ minHeight: 120, marginBottom: 12 }}><span className="data">{supplier || "Supplier"}</span><span className="data">{amountLabel}</span></div>
          <h2 className="tile-title" id="sum">Payment</h2>
          <div className="kv"><span>Supplier gets</span><span>{amountLabel}</span></div><div className="kv"><span>Invoice number</span><span>{invoice || "—"}</span></div><div className="kv"><span>Rail</span><span className="sx-rail">{rail}</span></div><div className="kv"><span>Fee and funding total</span><span>Calculated at review</span></div>
          <div className="tile-foot"><button type="button" className="sx-btn sx-btn--primary" disabled={!ready || busy} onClick={() => void onContinue()} style={{ flex: "1 1 auto", opacity: ready && !busy ? 1 : 0.5 }}>{busy ? "Working…" : paid ? "Already paid" : "Continue to payment"}</button></div>
        </section>
      </div>
    </div>
  )
}

export default function InvoiceConfirmPage() { return <Suspense fallback={<div className="page">Loading…</div>}><ConfirmInner /></Suspense> }
