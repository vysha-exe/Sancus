"use client"

import Link from "next/link"
import { useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { bills } from "@/lib/sancus/demo-data"

type Row = {
  id: string
  who: string
  invoice: string
  due: string
  rail: string
  amount: string
  usd: number
  paid?: boolean
}

const usdByBill: Record<string, { invoice: string; usd: number }> = {
  "Torrefação Lisboa": { invoice: "TL-118", usd: 1987.2 },
  "Café Oaxaca SA de CV": { invoice: "0457", usd: 1016.48 },
}

const rows: Row[] = [
  ...bills.map((b) => ({
    id: b.who,
    who: b.who,
    invoice: usdByBill[b.who]?.invoice ?? "—",
    due: b.meta.replace("Due ", ""),
    rail: b.rail,
    amount: b.amount,
    usd: usdByBill[b.who]?.usd ?? 0,
  })),
  {
    id: "northwind",
    who: "Northwind Supply Co.",
    invoice: "NW-2291",
    due: "Nov 30",
    rail: "ACH",
    amount: "$2,000.00",
    usd: 2000,
    paid: true,
  },
]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function InvoicesPage() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.paid).map((r) => r.id)),
  )
  const [fileName, setFileName] = useState("northwind-NW-2291.pdf")

  const picked = rows.filter((r) => selected.has(r.id))
  const total = picked.reduce((sum, r) => sum + r.usd, 0)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page">
      <header style={{ display: "grid", gap: 6, maxWidth: "62ch" }}>
        <h1 className="sx-h heading-2">Invoices</h1>
        <p className="body-s muted" style={{ margin: 0 }}>
          Drop in a supplier&apos;s invoice. We read it, match the supplier, and get the payment
          ready for you to check.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
        <label
          style={{
            position: "relative",
            flex: "1 1 280px",
            minHeight: 280,
            border: "1.5px dashed var(--line-strong)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: 24,
            background: "var(--surface-100)",
            cursor: "pointer",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="28"
            height="28"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--ink-muted)" }}
          >
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span className="body-strong">Drop an invoice here</span>
          <span className="body-s muted">PDF or photo, up to 10 MB</span>
          <span className="sx-btn sx-btn--secondary sx-btn--sm">Choose a file</span>
          <input
            type="file"
            className="vh"
            accept="application/pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setFileName(f.name)
            }}
          />
        </label>

        <section
          className="sx-panel"
          style={{ flex: "2 1 460px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}
          aria-labelledby="inv"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span className="sx-label" id="inv">
              Read from {fileName}
            </span>
            <span className="sx-pill sx-pill--settled">Supplier matched</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <label className="sx-field">
              <span className="sx-label">Supplier</span>
              <input className="sx-field__input" defaultValue="Northwind Supply Co." />
            </label>
            <label className="sx-field">
              <span className="sx-label">Invoice number</span>
              <input className="sx-field__input" defaultValue="NW-2291" />
            </label>
            <label className="sx-field">
              <span className="sx-label">Amount</span>
              <input
                className="sx-field__input"
                defaultValue="$2,000.00 USD"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </label>
            <label className="sx-field">
              <span className="sx-label">Due</span>
              <input className="sx-field__input" defaultValue="November 30" />
            </label>
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              paddingTop: 14,
              borderTop: "1px solid var(--line)",
            }}
          >
            <span className="sx-rail">ACH</span>
            <span className="body-s">To account ••• 8812 · arrives Wednesday · no fee</span>
            <StatusPill status="Simulated" />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/pay/review" className="sx-btn sx-btn--primary">
              Review payment to Northwind
            </Link>
            <span className="body-s muted">
              Bank details on the invoice match the ones you saved.
            </span>
          </div>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="due">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 id="due" className="sx-h heading-3">
            Bills to pay
          </h2>
          {picked.length > 0 ? (
            <Link href="/pay/review" className="sx-btn sx-btn--secondary sx-btn--sm">
              Pay {picked.length} selected · {money.format(total)}
            </Link>
          ) : (
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" disabled>
              Pay selected
            </button>
          )}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>
                  <span className="vh">Select</span>
                </th>
                <th>Supplier</th>
                <th>Due</th>
                <th>Rail</th>
                <th className="num">Amount</th>
                <th className="num">In USD</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={r.paid}
                      aria-label={`Select ${r.who}`}
                      style={{ accentColor: "var(--accent)" }}
                    />
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {r.who} · {r.invoice}
                  </td>
                  <td>{r.due}</td>
                  <td>
                    <span className="sx-rail">{r.rail}</span>
                  </td>
                  <td className="num">{r.amount}</td>
                  <td className="num">{money.format(r.usd)}</td>
                  <td>{r.paid ? <span className="sx-pill sx-pill--settled">Paid</span> : <StatusPill status="Due" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="body-s muted" style={{ margin: 0 }}>
          Batch pay goes to one review screen listing every rate and fee before you confirm.
        </p>
      </section>
    </div>
  )
}
