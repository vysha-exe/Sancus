"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { CollectionDemo } from "@/components/sancus/collection-demo"
import type { InvoiceDto } from "@/lib/sancus/invoices"

const MAX_BYTES = 10 * 1024 * 1024

function money(amount: number | null, currency: string) {
  if (amount === null) return "—"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export default function InvoicesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<InvoiceDto[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/invoices", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const body = (await res.json()) as { invoices?: InvoiceDto[] }
      setInvoices(body.invoices ?? [])
    } catch {
      setInvoices([])
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function upload(file: File) {
    if (file.size > MAX_BYTES) { setError("Invoices can be up to 10 MB."); return }
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/sancus/invoices", { method: "POST", body: form })
      const body = (await res.json().catch(() => ({}))) as { invoice?: InvoiceDto; error?: string }
      if (!res.ok || !body.invoice) {
        setError(res.status === 401 ? "Sign in to upload an invoice." : body.error ?? "Could not upload that invoice.")
        return
      }
      router.push(`/invoices/confirm?id=${body.invoice.id}`)
    } catch {
      setError("Could not reach Sancus. Try again.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="page">
      <header style={{ display: "grid", gap: 6, maxWidth: "62ch" }}>
        <h1 className="sx-h heading-2">Invoices</h1>
        <p className="body-s muted" style={{ margin: 0 }}>Upload a supplier&apos;s invoice, review the details, and prepare the payment.</p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
        <label style={{ position: "relative", flex: "1 1 280px", minHeight: 280, border: "1.5px dashed var(--line-strong)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, background: "var(--surface-100)", cursor: "pointer" }}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-muted)" }}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <span className="body-strong">{uploading ? "Reading your invoice…" : "Drop an invoice here"}</span>
          <span className="body-s muted">PDF or photo, up to 10 MB</span>
          <span className="sx-btn sx-btn--secondary sx-btn--sm" aria-disabled={uploading}>{uploading ? "Uploading…" : "Choose a file"}</span>
          {error ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{error}</span> : null}
          <input type="file" className="vh" accept="application/pdf,image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file) }} />
        </label>

        <section className="sx-panel" style={{ flex: "2 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} aria-labelledby="after-upload">
          <span className="sx-label" id="after-upload">After upload</span>
          <p className="body-s muted" style={{ margin: 0 }}>Review the supplier, amount, payment details, and invoice number before creating a payment. No supplier or payment details are filled in until you upload a file.</p>
        </section>
      </div>

      <section style={{ display: "grid", gap: 12 }} aria-labelledby="get-paid-locally">
        <div><h2 id="get-paid-locally" className="sx-h heading-3">Get paid locally</h2><p className="body-s muted" style={{ margin: 0 }}>Create an exact-amount QR for a customer to pay one of your branches through Pix, QRIS, or PromptPay.</p></div>
        <CollectionDemo />
      </section>

      <section style={{ display: "grid", gap: 12 }} aria-labelledby="due">
        <h2 id="due" className="sx-h heading-3">Bills to pay</h2>
        {invoices === null ? (
          <div className="tile empty">Loading invoices…</div>
        ) : invoices.length === 0 ? (
          <div className="tile empty">Uploaded invoices will appear here.</div>
        ) : (
          <div className="tile" style={{ display: "grid", gap: 0 }}>
            {invoices.map((invoice) => (
              <div key={invoice.id} className="kv" style={{ alignItems: "center", gap: 12 }}>
                <span style={{ display: "grid", minWidth: 0 }}>
                  <span className="body-strong trunc">{invoice.supplierName || invoice.fileName}</span>
                  <span className="body-s muted trunc">{invoice.invoiceNumber || invoice.fileName}{invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}</span>
                </span>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="data">{money(invoice.amount, invoice.currency)}</span>
                  <span className="sx-pill">{invoice.status === "PAID" ? "Paid" : invoice.status === "READY" ? "Ready to pay" : "Draft"}</span>
                  {invoice.status === "PAID" ? null : <Link href={`/invoices/confirm?id=${invoice.id}`} className="sx-btn sx-btn--secondary sx-btn--sm">Review</Link>}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
