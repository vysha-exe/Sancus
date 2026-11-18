"use client"

import { useRouter } from "next/navigation"
import { PublicReceiveQr } from "@/components/sancus-ui/public-receive-qr"

export default function InvoicesPage() {
  const router = useRouter()

  return (
    <div className="page">
      <header style={{ display: "grid", gap: 6, maxWidth: "62ch" }}>
        <h1 className="sx-h heading-2">Invoices</h1>
        <p className="body-s muted" style={{ margin: 0 }}>Upload a supplier&apos;s invoice, review the details, and prepare the payment.</p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
        <label style={{ position: "relative", flex: "1 1 280px", minHeight: 280, border: "1.5px dashed var(--line-strong)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, background: "var(--surface-100)", cursor: "pointer" }}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-muted)" }}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
          <span className="body-strong">Drop an invoice here</span>
          <span className="body-s muted">PDF or photo, up to 10 MB</span>
          <span className="sx-btn sx-btn--secondary sx-btn--sm">Choose a file</span>
          <input type="file" className="vh" accept="application/pdf,image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) router.push(`/invoices/confirm?file=${encodeURIComponent(file.name)}`) }} />
        </label>

        <section className="sx-panel" style={{ flex: "2 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} aria-labelledby="after-upload">
          <span className="sx-label" id="after-upload">After upload</span>
          <p className="body-s muted" style={{ margin: 0 }}>Review the supplier, amount, payment details, and invoice number before creating a payment. No supplier or payment details are filled in until you upload a file.</p>
        </section>
      </div>

      <section style={{ display: "grid", gap: 12 }} aria-labelledby="get-paid-locally">
        <div><h2 id="get-paid-locally" className="sx-h heading-3">Get paid locally</h2><p className="body-s muted" style={{ margin: 0 }}>Share a reusable branch QR for Pix, QRIS, or PromptPay. The customer chooses the amount when they pay.</p></div>
        <PublicReceiveQr />
      </section>

      <section style={{ display: "grid", gap: 12 }} aria-labelledby="due">
        <h2 id="due" className="sx-h heading-3">Bills to pay</h2>
        <div className="tile empty">Uploaded invoices will appear here.</div>
      </section>
    </div>
  )
}
