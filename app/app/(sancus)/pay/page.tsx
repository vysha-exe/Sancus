"use client"

import Link from "next/link"
import { useState } from "react"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { recipients } from "@/lib/sancus/demo-data"
import { usePayFlow } from "@/lib/sancus/pay-flow"

const filters = ["Recent", "Suppliers", "Contractors", "Team"] as const

export default function PayWhoPage() {
  const { recipient, setRecipientId } = usePayFlow()
  const [filter, setFilter] = useState<(typeof filters)[number]>("Recent")

  return (
    <div className="page">
      <PayFlowHead title="Choose a recipient" step={1} />

      <div className="grid">
        <section className="tile s7" aria-label="Choose a recipient">
          <label className="sx-field">
            <span className="sx-label">Search or add someone new</span>
            <input
              className="sx-field__input"
              placeholder="Name, email, Pix key, IBAN, CLABE or USDC address"
            />
          </label>
          <div className="filters" role="group" aria-label="Filter recipients">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Recent recipients" style={{ display: "grid", gap: 8 }}>
            {recipients.map((r) => {
              const on = r.id === recipient.id
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`pick${on ? " pick--on" : ""}`}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setRecipientId(r.id)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <span className="av">{r.initials}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                    <span className="body-strong trunc">{r.name}</span>
                    <span className="body-s trunc">{r.detail}</span>
                  </span>
                  {r.payout ? <span className="sx-pill sx-pill--settled">Live</span> : null}
                  <span className="sx-rail">{r.rail}</span>
                </button>
              )
            })}
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {recipients.length} recipients · <b>Live</b> ones are paid through the Sancus backend
            </span>
            <button type="button" className="sx-btn sx-btn--quiet">
              Show all
            </button>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="sel">
          <div className="tile-head">
            <span className="sx-label">Paying</span>
            <button type="button" className="sx-btn sx-btn--quiet">
              Edit
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span className="av av--lg">{recipient.initials}</span>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <h2 id="sel" className="sx-h heading-3 trunc">
                {recipient.name}
              </h2>
              <span className="body-s muted">
                {recipient.kind} · {recipient.country}
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <span className="sx-label">How we can pay them</span>
            {recipient.methods.map((m) => (
              <div className="kv" key={m.rail + m.detail}>
                <span>
                  <span className="sx-rail">{m.rail}</span> {m.detail}
                </span>
                <span>{m.tag}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <span className="sx-label">History</span>
            <span className="body-s muted">{recipient.history}</span>
          </div>
          <div className="tile-foot">
            <Link href="/invoices" className="sx-btn sx-btn--quiet">
              Pay from invoice
            </Link>
            <Link href="/pay/amount" className="sx-btn sx-btn--primary">
              Continue
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
