"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ActivityTabs } from "@/components/sancus-ui/activity-tabs"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { approvals, approvalsTotalLabel, balance } from "@/lib/sancus/demo-data"
import { useLiveActivity } from "@/lib/sancus/use-live-activity"

type Extra = {
  when: string
  by: string
  rail?: string
  theyGot: string
  fee: string
}

/** Ledger columns the shared demo data does not carry. */
const extras: Record<string, Extra> = {
  padaria: { when: "Today 10:02", by: "Ana", rail: "Pix QR", theyGot: "R$ 54,12", fee: "$0.00" },
  juliana: { when: "Today 9:41", by: "Maya", theyGot: "R$ 541,23", fee: "$0.80" },
  papelaria: { when: "Today 9:12", by: "Ana · 4021", theyGot: "R$ 541,23", fee: "$0.00" },
  northwind: { when: "Today 8:30", by: "Maya", theyGot: "$2,000.00", fee: "$0.00" },
  lumen: { when: "Fri 16:48", by: "Maya", theyGot: "$1,000.00", fee: "$0.00" },
  mercado: { when: "Fri 11:02", by: "—", theyGot: "—", fee: "$0.00" },
  pedro: { when: "Sat 14:05", by: "Maya", theyGot: "—", fee: "$0.00" },
}

const fallback: Extra = { when: "—", by: "—", theyGot: "—", fee: "$0.00" }

const statusOptions = ["Status", "Settled", "Pending", "Held", "Failed", "Simulated only"] as const

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function ActivityPage() {
  const [query, setQuery] = useState("")
  const [by, setBy] = useState("By")
  const [rail, setRail] = useState("Rail")
  const [status, setStatus] = useState<string>("Status")
  const live = useLiveActivity()

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return live.payments
      .map((p) => ({ p, x: extras[p.id] ?? fallback }))
      .filter(({ p, x }) => {
        const railLabel = x.rail ?? p.rail
        if (q && !`${p.who} ${p.amount} ${p.meta}`.toLowerCase().includes(q)) return false
        if (by !== "By" && !x.by.startsWith(by)) return false
        if (rail !== "Rail" && railLabel !== rail) return false
        if (status === "Simulated only") return Boolean(p.simulated)
        if (status !== "Status" && p.status !== status) return false
        return true
      })
  }, [live.payments, query, by, rail, status])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Activity</h1>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {live.source === "live" ? (
            <span className="sx-pill sx-pill--settled">Live payouts</span>
          ) : (
            <span className="sx-pill sx-pill--simulated">Demo ledger</span>
          )}
          <button type="button" className="sx-btn sx-btn--secondary">
            Export CSV
          </button>
          <Link href="/pay" className="sx-btn sx-btn--primary">
            Pay someone
          </Link>
        </div>
      </header>

      <ActivityTabs active="all" approvalCount={approvals.length} />

      <div className="grid">
        <div className="tile s3">
          <span className="sx-label">Available</span>
          <span className="big">{balance.availableLabel}</span>
        </div>
        <div className="tile s3">
          <span className="sx-label">Held for cards</span>
          <span className="big" style={{ color: "var(--held)" }}>
            {balance.heldLabel}
          </span>
        </div>
        <div className="tile s3">
          <span className="sx-label">On its way out</span>
          <span className="big">{balance.pendingOutLabel}</span>
        </div>
        <div className="tile s3">
          <span className="sx-label">Waiting for approval</span>
          <span className="big" style={{ color: "var(--pending)" }}>
            {approvalsTotalLabel}
          </span>
        </div>

        <section className="tile s12" aria-label="Ledger">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>
                    <label className="th-search">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <span className="vh">Search name, reference or amount</span>
                      <input
                        placeholder="Paid to / from"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by person</span>
                      <select value={by} onChange={(e) => setBy(e.target.value)}>
                        <option>By</option>
                        <option>Maya</option>
                        <option>Ana</option>
                        <option>Rafael</option>
                        <option>Payments agent</option>
                      </select>
                      <Chevron />
                    </label>
                  </th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by rail</span>
                      <select value={rail} onChange={(e) => setRail(e.target.value)}>
                        <option>Rail</option>
                        <option>USDC</option>
                        <option>ACH</option>
                        <option>Wire</option>
                        <option>Pix</option>
                        <option>Pix QR</option>
                        <option>SEPA</option>
                        <option>SPEI</option>
                        <option>Card</option>
                      </select>
                      <Chevron />
                    </label>
                  </th>
                  <th className="num">Amount</th>
                  <th className="num">They got</th>
                  <th className="num">Fee</th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by status</span>
                      <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        {statusOptions.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <Chevron />
                    </label>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, x }) => (
                  <tr key={p.id}>
                    <td className="data">{x.when}</td>
                    <td className="who">
                      <Link href={p.href ?? "/activity"} style={{ color: "inherit", textDecoration: "none" }}>
                        {p.who}
                      </Link>
                    </td>
                    <td>{x.by}</td>
                    <td>
                      <span className="sx-rail">{x.rail ?? p.rail}</span>
                    </td>
                    <td
                      className="num"
                      style={p.amountIn ? { color: "var(--settled)" } : undefined}
                    >
                      {p.amount}
                    </td>
                    <td className="num">{x.theyGot}</td>
                    <td className="num">{x.fee}</td>
                    <td>
                      <span className="pills" style={{ justifyContent: "flex-start" }}>
                        <StatusPill status={p.status} />
                        {p.simulated ? <StatusPill status="Simulated" /> : null}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="body-s muted">
                      Nothing matches those filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {rows.length} of {live.payments.length} · 50 per page, newest first
            </span>
            <span className="body-s muted">Updated 10:05</span>
          </div>
        </section>
      </div>
    </div>
  )
}
