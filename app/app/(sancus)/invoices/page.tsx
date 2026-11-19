"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { InvoiceIntake } from "@/components/sancus/invoice-intake"
import type { InvoiceDto } from "@/lib/sancus/invoices"

function money(amount: number | null, currency: string) {
  if (amount === null) return "—"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceDto[] | null>(null)

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

  return (
    <div className="page">
      <header style={{ display: "grid", gap: 6, maxWidth: "62ch" }}>
        <h1 className="sx-h heading-2">Invoices</h1>
        <p className="body-s muted" style={{ margin: 0 }}>Upload a supplier&apos;s invoice, review the details, and prepare the payment.</p>
      </header>

      <InvoiceIntake />

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
