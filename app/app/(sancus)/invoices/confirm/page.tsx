"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

function ConfirmInner() {
  const params = useSearchParams()
  const router = useRouter()
  const fileName = params.get("file") || "Uploaded invoice"
  const [supplier, setSupplier] = useState("")
  const [invoice, setInvoice] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [due, setDue] = useState("")
  const [rail, setRail] = useState("ACH")
  const [iban, setIban] = useState("")
  const [bic, setBic] = useState("")
  const amountLabel = useMemo(() => { const value = Number(amount.replace(/,/g, "")); return Number.isFinite(value) && value > 0 ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value) : "—" }, [amount, currency])
  const ready = supplier.trim().length > 0 && invoice.trim().length > 0 && amountLabel !== "—"

  return (
    <div className="page">
      <header className="page-head flowhead"><div className="title"><Link href="/invoices" className="icon-btn" aria-label="Back to Invoices">←</Link><h1 className="sx-h heading-2">Confirm invoice</h1></div><ol className="steps" aria-label="Pay an invoice"><li className="done">1 Upload</li><li aria-current="step">2 Confirm</li><li>3 Pay</li></ol></header>
      <div className="grid">
        <section className="tile s7" aria-labelledby="read">
          <div className="tile-head"><h2 className="tile-title" id="read">Review {fileName}</h2><span className="sx-pill">Review required</span></div>
          <div className="grid" style={{ gap: 14 }}>
            <label className="sx-field s6"><span className="sx-label">Supplier</span><input className="sx-field__input" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Invoice or order number</span><input className="sx-field__input" value={invoice} onChange={(e) => setInvoice(e.target.value)} /><span className="sx-field__help">Used to match this payment to the supplier&apos;s invoice in activity and reconciliation.</span></label>
            <label className="sx-field s6"><span className="sx-label">Amount</span><input className="sx-field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Currency</span><select className="sx-field__input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="USD">USD · US dollar</option><option value="EUR">EUR · euro</option><option value="BRL">BRL · real</option><option value="IDR">IDR · rupiah</option><option value="THB">THB · baht</option></select></label>
            <label className="sx-field s6"><span className="sx-label">Due date</span><input className="sx-field__input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label className="sx-field s6"><span className="sx-label">Pay by</span><select className="sx-field__input" value={rail} onChange={(e) => setRail(e.target.value)}><option value="ACH">ACH</option><option value="SEPA">SEPA transfer</option><option value="WIRE">Wire transfer</option><option value="USDC">USDC</option></select></label>
            {rail === "SEPA" ? <><label className="sx-field s12"><span className="sx-label">IBAN</span><input className="sx-field__input" value={iban} onChange={(e) => setIban(e.target.value)} /></label><label className="sx-field s6"><span className="sx-label">BIC</span><input className="sx-field__input" value={bic} onChange={(e) => setBic(e.target.value)} /></label></> : null}
          </div>
          <div className="tile-foot"><span className="body-s muted">Check these details against the uploaded invoice.</span><button type="button" className="sx-btn sx-btn--quiet" onClick={() => router.push("/invoices")}>Upload a different file</button></div>
        </section>
        <section className="tile s5" aria-labelledby="sum">
          <div className="empty" style={{ minHeight: 120, marginBottom: 12 }}><span className="data">{supplier || "Supplier"}</span><span className="data">{amountLabel}</span></div>
          <h2 className="tile-title" id="sum">Payment</h2>
          <div className="kv"><span>Supplier gets</span><span>{amountLabel}</span></div><div className="kv"><span>Invoice number</span><span>{invoice || "—"}</span></div><div className="kv"><span>Rail</span><span className="sx-rail">{rail}</span></div><div className="kv"><span>Fee and funding total</span><span>Calculated at review</span></div>
          <div className="tile-foot"><Link href={ready ? "/pay/review" : "#"} aria-disabled={!ready} className="sx-btn sx-btn--primary" style={{ flex: "1 1 auto", pointerEvents: ready ? "auto" : "none", opacity: ready ? 1 : 0.5 }}>Continue to payment</Link></div>
        </section>
      </div>
    </div>
  )
}

export default function InvoiceConfirmPage() { return <Suspense fallback={<div className="page">Loading…</div>}><ConfirmInner /></Suspense> }
