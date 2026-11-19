"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { AddPayeeSheet } from "@/components/sancus-ui/add-payee-sheet"
import { PayFlowHead } from "@/components/sancus-ui/pay-steps"
import { recipientIsLive, type Recipient } from "@/lib/sancus/demo-data"
import { usePayFlow } from "@/lib/sancus/pay-flow"
import { useAccount } from "@/lib/sancus/use-account"

const businessFilters = ["All", "Suppliers", "Contractors", "Team"] as const
const personalFilters = ["All", "Friends & family", "Shops & businesses"] as const
type Filter = (typeof businessFilters)[number] | (typeof personalFilters)[number]

function RecipientPayoutPill({ live }: { live: boolean }) {
  return live ? (
    <span className="sx-pill sx-pill--settled">Live</span>
  ) : (
    <span className="sx-pill sx-pill--simulated">Simulated</span>
  )
}

function RecipientKindRail({ r }: { r: Recipient }) {
  return (
    <span
      className="body-s"
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 8px", minWidth: 0 }}
    >
      <span className="trunc">
        {r.kind} · {r.rail}
      </span>
      <RecipientPayoutPill live={recipientIsLive(r)} />
    </span>
  )
}

function matchesFilter(r: Recipient, filter: Filter) {
  if (filter === "All") return true
  if (filter === "Suppliers") return r.kind === "Supplier"
  if (filter === "Contractors") return r.kind === "Contractor"
  if (filter === "Friends & family") return r.kind === "Friend" || r.kind === "Family"
  if (filter === "Shops & businesses") return r.kind === "Shop" || r.kind === "Business"
  return r.kind === "Team"
}

/** Personal accounts: pay anyone by scanning their QR or typing their bank details. */
function QuickPay() {
  return (
    <div className="grid" style={{ marginBottom: 16 }}>
      <Link href="/pay/scan" className="tile s6" style={{ display: "grid", gap: 6, textDecoration: "none", color: "inherit" }}>
        <span className="body-strong">Scan a QR code</span>
        <span className="body-s muted">PromptPay or Pix: point your camera or upload a picture of the code.</span>
      </Link>
      <Link href="/pay/us-bank" className="tile s6" style={{ display: "grid", gap: 6, textDecoration: "none", color: "inherit" }}>
        <span className="body-strong">Enter bank details</span>
        <span className="body-s muted">Send to a company&apos;s US bank account by ACH. USDC becomes USD at 1:1.</span>
      </Link>
    </div>
  )
}

export default function PayWhoPage() {
  const { recipient, recipients, setRecipientId, invoice } = usePayFlow()
  const { account } = useAccount()
  const personal = account?.type === "INDIVIDUAL"
  const filters: readonly Filter[] = personal ? personalFilters : businessFilters
  const [filter, setFilter] = useState<Filter>("All")
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

      {invoice ? (
        <div className="tile s12" role="status" style={{ marginBottom: 16 }}>
          <span className="body-s">
            <b>Paying invoice{invoice.invoiceNumber ? ` ${invoice.invoiceNumber}` : ""}</b> from {invoice.supplier} ·{" "}
            {new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(invoice.amount)}.{" "}
            {invoice.matched ? `We selected ${recipient.name}.` : "Pick the payee or add a new one to continue."}
          </span>
        </div>
      ) : null}

      <p className="body-s muted" style={{ margin: "-8px 0 20px" }}>
        {personal
          ? "Scan a QR, enter bank details, or pick someone you've paid before."
          : "Pick someone from your list, or add a new payee. Then continue to enter the amount."}
      </p>

      {personal ? <QuickPay /> : null}

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
                      <RecipientKindRail r={r} />
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
              <RecipientKindRail r={recipient} />
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
