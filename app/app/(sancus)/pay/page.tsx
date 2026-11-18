"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AddPayeeSheet } from "@/components/sancus-ui/add-payee-sheet"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import type { Recipient } from "@/lib/sancus/demo-data"
import { usePayFlow } from "@/lib/sancus/pay-flow"

const filters = ["All", "Suppliers", "Contractors", "Team"] as const

function matchesFilter(r: Recipient, filter: (typeof filters)[number]) {
  if (filter === "All") return true
  if (filter === "Suppliers") return r.kind === "Supplier"
  if (filter === "Contractors") return r.kind === "Contractor"
  return r.kind === "Team"
}

export default function PayWhoPage() {
  const { recipient, recipients, setRecipientId } = usePayFlow()
  const [filter, setFilter] = useState<(typeof filters)[number]>("All")
  const [query, setQuery] = useState("")
  const [adding, setAdding] = useState(false)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recipients.filter((r) => {
      if (!matchesFilter(r, filter)) return false
      if (!q) return true
      return [r.name, r.detail, r.rail, r.country, r.kind].join(" ").toLowerCase().includes(q)
    })
  }, [filter, query, recipients])

  const method = recipient.methods[0]

  return (
    <div className="page">
      <PayFlowHead title="Who are you paying?" step={1} />

      <p className="body-s muted" style={{ margin: "-8px 0 20px" }}>
        Pick someone from your list, or add a new payee. Then continue to enter the amount.
      </p>

      <div className="grid">
        <section className="tile s8" aria-label="Choose a recipient">
          <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
            <label className="sx-field" style={{ flex: "1 1 220px", margin: 0 }}>
              <span className="sx-label">Find a payee</span>
              <input
                className="sx-field__input"
                placeholder="Search by name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button type="button" className="sx-btn sx-btn--secondary" onClick={() => setAdding(true)}>
              Add payee
            </button>
          </div>

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

          <div role="radiogroup" aria-label="Payees" style={{ display: "grid", gap: 8 }}>
            {visible.length === 0 ? (
              <div style={{ display: "grid", gap: 12, padding: "8px 2px" }}>
                <span className="body-s muted">
                  {query.trim() ? "No payees match that search." : "No payees in this filter yet."}
                </span>
                <button type="button" className="sx-btn sx-btn--primary" onClick={() => setAdding(true)} style={{ justifySelf: "start" }}>
                  Add a payee
                </button>
              </div>
            ) : (
              visible.map((r) => {
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
                      <span className="body-s trunc">
                        {r.kind} · {r.rail}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </section>

        <aside className="tile s4" aria-labelledby="sel">
          <span className="sx-label">Selected</span>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8 }}>
            <span className="av av--lg">{recipient.initials}</span>
            <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <h2 id="sel" className="sx-h heading-3 trunc" style={{ margin: 0 }}>
                {recipient.name}
              </h2>
              <span className="body-s muted trunc">
                {method ? `${method.rail} · ${method.detail}` : recipient.rail}
              </span>
            </div>
          </div>

          <div className="tile-foot" style={{ marginTop: 24, flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <Link href="/pay/amount" className="sx-btn sx-btn--primary">
              Continue to amount
            </Link>
            <Link href="/pay/us-bank" className="body-s muted" style={{ textAlign: "center", textDecoration: "underline", textUnderlineOffset: 3 }}>
              Or pay a US bank by ACH
            </Link>
          </div>
        </aside>
      </div>

      {adding ? <AddPayeeSheet onClose={() => setAdding(false)} /> : null}
    </div>
  )
}
