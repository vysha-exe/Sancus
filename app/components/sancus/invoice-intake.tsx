"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import type { InvoiceDto } from "@/lib/sancus/invoices"

const MAX_BYTES = 10 * 1024 * 1024
const RAIL_BY_CURRENCY: Record<string, string> = { USD: "ACH", SGD: "PAYNOW", EUR: "SEPA", BRL: "PIX", IDR: "WIRE", THB: "WIRE" }

function inTwoWeeks() {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

export function InvoiceIntake() {
  const router = useRouter()
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [dueDate, setDueDate] = useState(inTwoWeeks)
  const [rail, setRail] = useState("ACH")
  const [bankName, setBankName] = useState("")
  const [accountName, setAccountName] = useState("")
  const [accountNumber, setAccountNumber] = useState("")
  const [routingNumber, setRoutingNumber] = useState("")
  const [accountType, setAccountType] = useState<"CHECKING" | "SAVINGS">("CHECKING")
  const [swift, setSwift] = useState("")
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parsed, setParsed] = useState(false)
  const amountValue = useMemo(() => Number(amount.replace(/,/g, "")), [amount])
  const valid = Boolean(supplierName.trim() && invoiceNumber.trim() && Number.isFinite(amountValue) && amountValue > 0 && dueDate)

  function fill(invoice: InvoiceDto) {
    setInvoiceId(invoice.id)
    setFileName(invoice.fileName)
    setSupplierName(invoice.supplierName ?? "")
    setInvoiceNumber(invoice.invoiceNumber ?? "")
    setAmount(invoice.amount === null ? "" : String(invoice.amount))
    setCurrency(invoice.currency)
    setDueDate(invoice.dueDate ?? "")
    setRail(invoice.rail ?? RAIL_BY_CURRENCY[invoice.currency] ?? "WIRE")
    setBankName(invoice.paymentDetails.bankName ?? "")
    setAccountName(invoice.paymentDetails.accountName ?? "")
    setAccountNumber(invoice.paymentDetails.accountNumber ?? "")
    setRoutingNumber(invoice.paymentDetails.routingNumber ?? "")
    setAccountType(invoice.paymentDetails.accountType ?? "CHECKING")
    setSwift(invoice.paymentDetails.swift ?? "")
  }

  async function upload(file: File) {
    if (file.size > MAX_BYTES) { setError("Invoices can be up to 10 MB."); return }
    setUploading(true)
    setError(null)
    setParsed(false)
    try {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch("/api/sancus/invoices", { method: "POST", body: form })
      const body = await response.json().catch(() => ({})) as { invoice?: InvoiceDto; error?: string }
      if (!response.ok || !body.invoice) throw new Error(body.error || "Could not parse that invoice")
      fill(body.invoice)
      setParsed(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not parse that invoice")
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!valid) return
    setSaving(true)
    setError(null)
    const payload = {
      supplierName: supplierName.trim(), invoiceNumber: invoiceNumber.trim(), amount: amountValue,
      currency, dueDate, rail,
      paymentDetails: {
        bankName: bankName.trim() || null,
        accountName: accountName.trim() || null,
        accountNumber: accountNumber.trim() || null,
        routingNumber: routingNumber.trim() || null,
        accountType: rail === "ACH" ? accountType : null,
        swift: swift.trim() || null,
      },
    }
    try {
      const response = await fetch(invoiceId ? `/api/sancus/invoices/${invoiceId}` : "/api/sancus/invoices", {
        method: invoiceId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json().catch(() => ({})) as { invoice?: InvoiceDto; error?: string; issues?: { message: string }[] }
      if (!response.ok || !body.invoice) throw new Error(body.issues?.[0]?.message || body.error || "Could not save the invoice")
      router.push(`/invoices/confirm?id=${body.invoice.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the invoice")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
      <label style={{ position: "relative", flex: "1 1 280px", minHeight: 360, border: "1.5px dashed var(--line-strong)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, background: "var(--surface-100)", cursor: uploading ? "wait" : "pointer" }}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-muted)" }}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
        <span className="body-strong">{uploading ? "Reading invoice…" : fileName || "Drop an invoice here"}</span>
        <span className="body-s muted">Image or PDF · up to 10 MB</span>
        <span className="sx-btn sx-btn--secondary sx-btn--sm" aria-disabled={uploading}>{uploading ? "Parsing…" : "Choose a file"}</span>
        <input type="file" className="vh" accept="application/pdf,image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file) }} />
        <span className="body-s muted">or</span>
        <a href="/samples/northstar-office-supplies-invoice.png" download onClick={(event) => event.stopPropagation()} className="body-s" style={{ color: "var(--brand-700)", textDecoration: "underline" }}>Download sample invoice</a>
      </label>

      <section className="sx-panel" style={{ flex: "2 1 560px", minWidth: 0, display: "grid", gap: 16 }} aria-labelledby="invoice-details">
        <div className="tile-head"><div><span className="sx-label" id="invoice-details">Invoice details</span><p className="body-s muted" style={{ margin: "6px 0 0" }}>Fill this out manually, or upload a file to prefill the fields for review.</p></div><span className={`sx-pill${parsed ? " sx-pill--settled" : ""}`}>{parsed ? "Auto-filled" : "Manual"}</span></div>
        <div className="grid" style={{ gap: 12 }}>
          <label className="sx-field s6"><span className="sx-label">Supplier</span><input className="sx-field__input" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Supplier business name" /></label>
          <label className="sx-field s6"><span className="sx-label">Invoice number</span><input className="sx-field__input" value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="INV-1001" /></label>
          <label className="sx-field s4"><span className="sx-label">Total due</span><input className="sx-field__input" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
          <label className="sx-field s4"><span className="sx-label">Currency</span><select className="sx-field__input" value={currency} onChange={(event) => { const next = event.target.value; setCurrency(next); setRail(RAIL_BY_CURRENCY[next] ?? "WIRE") }}><option>USD</option><option>SGD</option><option>EUR</option><option>BRL</option><option>IDR</option><option>THB</option></select></label>
          <label className="sx-field s4"><span className="sx-label">Due date</span><input className="sx-field__input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label className="sx-field s4"><span className="sx-label">Pay by</span><select className="sx-field__input" value={rail} onChange={(event) => setRail(event.target.value)}><option>ACH</option><option>PAYNOW</option><option>SEPA</option><option>WIRE</option><option>USDC</option><option>PIX</option></select></label>
          <label className="sx-field s4"><span className="sx-label">Bank</span><input className="sx-field__input" value={bankName} onChange={(event) => setBankName(event.target.value)} placeholder="Bank name" /></label>
          <label className="sx-field s4"><span className="sx-label">Account name</span><input className="sx-field__input" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Beneficiary name" /></label>
          <label className="sx-field s6"><span className="sx-label">Account number / IBAN</span><input className="sx-field__input" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Account number" /></label>
          {rail === "ACH" ? <>
            <label className="sx-field s6"><span className="sx-label">ABA routing number</span><input className="sx-field__input" inputMode="numeric" value={routingNumber} onChange={(event) => setRoutingNumber(event.target.value.replace(/\D/g, ""))} placeholder="9 digits" /></label>
            <label className="sx-field s6"><span className="sx-label">Account type</span><select className="sx-field__input" value={accountType} onChange={(event) => setAccountType(event.target.value as "CHECKING" | "SAVINGS")}><option value="CHECKING">Checking</option><option value="SAVINGS">Savings</option></select></label>
          </> : null}
          <label className="sx-field s6"><span className="sx-label">SWIFT / BIC</span><input className="sx-field__input" value={swift} onChange={(event) => setSwift(event.target.value)} placeholder="Optional" /></label>
        </div>
        {error ? <p className="body-s" role="alert" style={{ margin: 0, color: "var(--danger, #c0392b)" }}>{error}</p> : null}
        <div className="tile-foot"><span className="body-s muted">Auto-filled details are never paid automatically. You review and edit them first.</span><button type="button" className="sx-btn sx-btn--primary" disabled={!valid || saving || uploading} onClick={() => void save()} style={{ opacity: valid && !saving && !uploading ? 1 : .5 }}>{saving ? "Saving…" : invoiceId ? "Review payment" : "Create invoice"}</button></div>
      </section>
    </div>
  )
}
