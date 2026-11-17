"use client"

import { useState } from "react"
import { ActivityTabs } from "@/components/sancus-ui/activity-tabs"
import { approvals } from "@/lib/sancus/demo-data"

type Decision = "approved" | "declined"
type Filter = "waiting" | "approved" | "declined" | "expired"

type Detail = {
  asker: string
  initials: string
  to: string
  rail: string
  headline: string
  when: string
  localAmount: string
  rate: string
  fee: string
  arrival: string
  why: string
}

/** Request detail the shared approvals list does not carry. */
const details: Record<string, Detail> = {
  "ana-grafica": {
    asker: "Ana Souza",
    initials: "AS",
    to: "GrÃ¡fica Aurora",
    rail: "Pix",
    headline: "Ana wants to pay GrÃ¡fica Aurora",
    when: 'Today, 8:05 Â· "Menu printing" Â· invoice attached',
    localAmount: "R$ 3.200,00",
    rate: "1 USD = 5.4123 BRL",
    fee: "$0.80",
    arrival: "within seconds",
    why: "Ana's per-payment limit is $500.00. You or Rafael can approve.",
  },
  "rafael-torrefacao": {
    asker: "Rafael Lima",
    initials: "RL",
    to: "TorrefaÃ§Ã£o Lisboa",
    rail: "SEPA",
    headline: "Rafael wants to pay TorrefaÃ§Ã£o Lisboa",
    when: 'Today, 7:40 Â· "Green coffee, TL-118" Â· invoice attached',
    localAmount: "â‚¬ 1.840,00",
    rate: "1 EUR = 1.0800 USD",
    fee: "$0.80",
    arrival: "same day",
    why: "TorrefaÃ§Ã£o Lisboa is a new recipient. First payments to someone new always need an approver.",
  },
  "agent-crop": {
    asker: "Payments agent",
    initials: "PA",
    to: "Crop imagery API",
    rail: "Agent",
    headline: "Payments agent wants to pay Crop imagery API",
    when: "Today, 6:15 Â· x402 request",
    localAmount: "$40.00",
    rate: "No conversion",
    fee: "$0.00",
    arrival: "within seconds",
    why: "The agent has spent $12.40 of its $50.00 weekly budget. This would take it over.",
  },
}

const filters: { id: Filter; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "declined", label: "Declined" },
  { id: "expired", label: "Expired" },
]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function ApprovalsPage() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [selectedId, setSelectedId] = useState<string>(approvals[0].id)
  const [filter, setFilter] = useState<Filter>("waiting")
  const [note, setNote] = useState("")

  const waiting = approvals.filter((a) => !decisions[a.id])
  const waitingTotal = waiting.reduce((sum, a) => sum + a.amountUsd, 0)

  const visible = approvals.filter((a) => {
    const d = decisions[a.id]
    if (filter === "waiting") return !d
    if (filter === "expired") return false
    return d === filter
  })

  const selected = approvals.find((a) => a.id === selectedId) ?? approvals[0]
  const detail = details[selected.id]
  const decision = decisions[selected.id]

  function decide(id: string, value: Decision) {
    setDecisions((prev) => ({ ...prev, [id]: value }))
    setNote("")
    const next = approvals.find((a) => a.id !== id && !decisions[a.id])
    if (next) setSelectedId(next.id)
  }

  function approveAll() {
    setDecisions((prev) => {
      const out = { ...prev }
      for (const a of approvals) if (!out[a.id]) out[a.id] = "approved"
      return out
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Activity</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Payments waiting for someone with the right to approve them. Nothing leaves your
            balance until they do.
          </p>
        </div>
      </header>

      <ActivityTabs active="approvals" approvalCount={waiting.length} />

      <div className="grid">
        <section className="tile s7" aria-label="Approval requests">
          <div className="filters" role="group" aria-label="Filter requests">
            {filters.map((f) => {
              const count =
                f.id === "waiting"
                  ? waiting.length
                  : f.id === "expired"
                    ? 0
                    : approvals.filter((a) => decisions[a.id] === f.id).length
              return (
                <button
                  key={f.id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id === "waiting" || count > 0 ? ` Â· ${count}` : ""}
                </button>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              {filter === "waiting"
                ? "Nothing needs you. Payments waiting for your approval will show up here."
                : `No ${filter} requests.`}
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Asked by</th>
                    <th>To</th>
                    <th className="num">Amount</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const d = details[a.id]
                    return (
                      <tr key={a.id} className={a.id === selected.id ? "on" : undefined}>
                        <td style={{ fontWeight: 600 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(a.id)}
                            aria-pressed={a.id === selected.id}
                            style={{
                              all: "unset",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            {d.asker}
                          </button>
                        </td>
                        <td className="who">
                          <span className="sx-rail">{d.rail}</span> {d.to}
                        </td>
                        <td className="num">{a.amount}</td>
                        <td className="body-s">{a.reason}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="tile-foot">
            <span className="body-s muted">Oldest first. Requests expire after 7 days.</span>
            <button
              type="button"
              className="sx-btn sx-btn--secondary sx-btn--sm"
              onClick={approveAll}
              disabled={waiting.length === 0}
            >
              Approve all I can Â· {money.format(waitingTotal)}
            </button>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="req">
          <div className="tile-head">
            <span className="sx-label">Request</span>
            {decision === "approved" ? (
              <span className="sx-pill sx-pill--settled">Approved</span>
            ) : decision === "declined" ? (
              <span className="sx-pill sx-pill--failed">Declined</span>
            ) : (
              <span className="sx-pill sx-pill--pending">Pending</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span className="av">{detail.initials}</span>
            <div style={{ display: "grid", minWidth: 0 }}>
              <h2 id="req" className="sx-h heading-3 trunc">
                {detail.headline}
              </h2>
              <span className="body-s muted">{detail.when}</span>
            </div>
          </div>
          <div className="sx-quote" style={{ gap: 10 }}>
            <dl>
              <dt>Amount</dt>
              <dd>{detail.localAmount}</dd>
              <dt>Rate</dt>
              <dd>{detail.rate}</dd>
              <dt>Fee</dt>
              <dd>{detail.fee}</dd>
              <dt>Rail</dt>
              <dd>
                <span className="sx-rail">{detail.rail}</span> Â· {detail.arrival}
              </dd>
            </dl>
            <div className="sx-quote__receive">
              <span>You pay</span>
              <b>{selected.amount}</b>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gap: 6,
              padding: 12,
              borderRadius: "var(--radius-sm)",
              background: "var(--surface-000)",
            }}
          >
            <span className="body-s">
              <b>Why it&apos;s here:</b> {detail.why}
            </span>
            <span className="body-s muted">
              The rate locks when you approve. If it&apos;s moved more than 1% since{" "}
              {detail.asker.split(" ")[0]} asked, we show both amounts first.
            </span>
          </div>
          <label className="sx-field">
            <span className="sx-label">Note to {detail.asker.split(" ")[0]}</span>
            <input
              className="sx-field__input"
              placeholder="Optional, shown if you decline"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={Boolean(decision)}
            />
          </label>
          <div className="tile-foot">
            <button
              type="button"
              className="sx-btn sx-btn--secondary"
              disabled={Boolean(decision)}
              onClick={() => decide(selected.id, "declined")}
            >
              Decline
            </button>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              disabled={Boolean(decision)}
              onClick={() => decide(selected.id, "approved")}
            >
              Approve {selected.amount}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
