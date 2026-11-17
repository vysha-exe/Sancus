"use client"

import { useState } from "react"
import { ActivityTabs } from "@/components/sancus-ui/activity-tabs"
import { useLiveApprovals, type ApprovalItem } from "@/lib/sancus/use-live-approvals"

type Decision = "approved" | "declined"
type Filter = "waiting" | "approved" | "declined" | "expired"

type Detail = {
  rail: string
  headline: string
  when: string
  localAmount: string
  rate: string
  fee: string
  arrival: string
  why: string
}

/** Rich detail for the demo requests (live requests carry their own). */
const demoDetails: Record<string, Detail> = {
  "ana-grafica": {
    rail: "Pix",
    headline: "Ana wants to pay Gráfica Aurora",
    when: 'Today, 8:05 · "Menu printing" · invoice attached',
    localAmount: "R$ 3.200,00",
    rate: "1 USD = 5.4123 BRL",
    fee: "$0.80",
    arrival: "within seconds",
    why: "Ana's per-payment limit is $500.00. You or Rafael can approve.",
  },
  "rafael-torrefacao": {
    rail: "SEPA",
    headline: "Rafael wants to pay Torrefação Lisboa",
    when: 'Today, 7:40 · "Green coffee, TL-118" · invoice attached',
    localAmount: "€ 1.840,00",
    rate: "1 EUR = 1.0800 USD",
    fee: "$0.80",
    arrival: "same day",
    why: "Torrefação Lisboa is a new recipient. First payments to someone new always need an approver.",
  },
  "agent-crop": {
    rail: "Agent",
    headline: "Payments agent wants to pay Crop imagery API",
    when: "Today, 6:15 · x402 request",
    localAmount: "$40.00",
    rate: "No conversion",
    fee: "$0.00",
    arrival: "within seconds",
    why: "The agent has spent $12.40 of its $50.00 weekly budget. This would take it over.",
  },
}

function detailFor(a: ApprovalItem): Detail {
  if (!a.live && demoDetails[a.id]) return demoDetails[a.id]!
  return {
    rail: a.rail,
    headline: `Payment to ${a.to}`,
    when: a.when,
    localAmount: a.localAmount,
    rate: a.rate,
    fee: a.fee,
    arrival: a.arrival,
    why: a.reason,
  }
}

const filters: { id: Filter; label: string }[] = [
  { id: "waiting", label: "Waiting" },
  { id: "approved", label: "Approved" },
  { id: "declined", label: "Declined" },
  { id: "expired", label: "Expired" },
]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export default function ApprovalsPage() {
  const live = useLiveApprovals()
  const isLive = live.source === "live"

  // Demo mode keeps decisions in memory; live mode reads them from the backend.
  const [demoDecisions, setDemoDecisions] = useState<Record<string, Decision>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("waiting")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all: ApprovalItem[] = isLive
    ? [...live.waiting, ...live.decided]
    : live.waiting.map((a) => ({ ...a, decision: demoDecisions[a.id] }))

  const waiting = all.filter((a) => !a.decision)
  const waitingTotal = waiting.reduce((sum, a) => sum + a.amountUsd, 0)
  const visible = all.filter((a) => {
    if (filter === "waiting") return !a.decision
    if (filter === "expired") return false
    return a.decision === filter
  })

  const selected = all.find((a) => a.id === selectedId) ?? waiting[0] ?? visible[0] ?? null
  const detail = selected ? detailFor(selected) : null
  const decision = selected?.decision

  async function decide(id: string, value: Decision) {
    setError(null)
    if (isLive) {
      setBusy(true)
      const err = await live.decide(id, value === "approved" ? "approve" : "decline", note)
      setBusy(false)
      if (err) {
        setError(err)
        return
      }
    } else {
      setDemoDecisions((prev) => ({ ...prev, [id]: value }))
    }
    setNote("")
    const next = waiting.find((a) => a.id !== id)
    setSelectedId(next?.id ?? null)
  }

  async function approveAll() {
    setError(null)
    if (!isLive) {
      setDemoDecisions((prev) => {
        const out = { ...prev }
        for (const a of waiting) out[a.id] = "approved"
        return out
      })
      return
    }
    setBusy(true)
    for (const a of waiting) {
      const err = await live.decide(a.id, "approve")
      if (err) {
        setError(err)
        break
      }
    }
    setBusy(false)
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
        {isLive ? <span className="sx-pill sx-pill--settled">Live</span> : null}
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
                    : all.filter((a) => a.decision === f.id).length
              return (
                <button
                  key={f.id}
                  type="button"
                  className="chip"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id === "waiting" || count > 0 ? ` · ${count}` : ""}
                </button>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              {filter === "waiting"
                ? "Nothing needs you. Payments at or over your approval rule will show up here."
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
                    const d = detailFor(a)
                    return (
                      <tr key={a.id} className={a.id === selected?.id ? "on" : undefined}>
                        <td style={{ fontWeight: 600 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(a.id)}
                            aria-pressed={a.id === selected?.id}
                            style={{ all: "unset", cursor: "pointer", fontWeight: 600 }}
                          >
                            {a.asker}
                          </button>
                        </td>
                        <td className="who">
                          {d.rail ? <span className="sx-rail">{d.rail}</span> : null} {a.to}
                        </td>
                        <td className="num">{a.amountLabel}</td>
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
              disabled={waiting.length === 0 || busy}
            >
              Approve all I can · {money.format(waitingTotal)}
            </button>
          </div>
        </section>

        <aside className="tile s5" aria-labelledby="req">
          {selected && detail ? (
            <>
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
                <span className="av">{selected.initials}</span>
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
                    {detail.rail ? <span className="sx-rail">{detail.rail}</span> : null} · {detail.arrival}
                  </dd>
                </dl>
                <div className="sx-quote__receive">
                  <span>You pay</span>
                  <b>{selected.amountLabel}</b>
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
                  The funds are reserved now. Approving sends the payment; declining releases the money back
                  to your balance.
                </span>
              </div>
              <label className="sx-field">
                <span className="sx-label">Note</span>
                <input
                  className="sx-field__input"
                  placeholder="Optional, saved with your decision"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={Boolean(decision) || busy}
                />
              </label>
              {error ? (
                <p className="body-s" role="alert" style={{ margin: 0, color: "var(--danger, #c0392b)" }}>
                  {error}
                </p>
              ) : null}
              <div className="tile-foot">
                <button
                  type="button"
                  className="sx-btn sx-btn--secondary"
                  disabled={Boolean(decision) || busy}
                  onClick={() => decide(selected.id, "declined")}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="sx-btn sx-btn--primary"
                  disabled={Boolean(decision) || busy}
                  onClick={() => decide(selected.id, "approved")}
                >
                  {busy ? "Saving…" : `Approve ${selected.amountLabel}`}
                </button>
              </div>
            </>
          ) : (
            <div className="empty">Pick a request to see the details.</div>
          )}
        </aside>
      </div>
    </div>
  )
}
