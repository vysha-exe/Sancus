"use client"

import Link from "next/link"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import type { CompanyNode } from "@/lib/sancus/companies"

const usd6 = (minor: string) => `$${(Number(minor) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function HomeBalance() {
  const ws = useWorkspace()
  // Business workspace: that company plus its branches. Personal: your own wallets + Gateway.
  const scope = !ws.ready ? undefined : ws.isPersonal || !ws.activeNode ? null : ws.activeNode.id
  const live = useLiveTreasury(undefined, scope)
  // Where the balance sits: each node's own balance after its payments (adds up to the headline).
  const nodes: { id: string; name: string; ownMinor: string }[] = []
  const walk = (n: CompanyNode) => {
    if (n.ownMinor !== "0") nodes.push({ id: n.id, name: n.parentId ? n.name : `${n.name} (HQ)`, ownMinor: n.ownMinor })
    n.children.forEach(walk)
  }
  if (scope && ws.activeNode && ws.balancesReady) walk(ws.activeNode)

  return (
    <section className="tile s8" aria-labelledby="bal" aria-busy={live.loading}>
      <div className="tile-head">
        <span className="sx-label" id="bal">
          Available balance
        </span>
        <div className="filters" role="group" aria-label="Chart range">
          {live.source === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
          <button type="button" className="chip" aria-pressed="true">
            This month
          </button>
          <button type="button" className="chip" aria-pressed="false">
            6 months
          </button>
          <button type="button" className="chip" aria-pressed="false">
            Year
          </button>
        </div>
      </div>
      <div className="sx-balance">
        <span className="sx-balance__amount">
          {live.loading ? "***" : live.availableLabel} <small>USD</small>
        </span>
        <span className="sx-balance__meta">
          {live.loading ? "***" : `${scope && ws.activeNode ? `${ws.activeNode.name} and its branches · ` : ""}${live.meta}`}
        </span>
      </div>
      {scope && nodes.length ? (
        <div style={{ display: "grid", gap: 4 }} aria-label="Where the balance sits">
          {nodes.map((n) => (
            <div className="kv" key={n.id}>
              <span className="body-s">{n.name}</span>
              <span className="body-s data">{usd6(n.ownMinor)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <svg
        viewBox="0 0 600 120"
        preserveAspectRatio="none"
        role="img"
        aria-label="Balance this month"
        style={{ width: "100%", height: 110, color: "var(--accent)" }}
      >
        <line x1="0" y1="119" x2="600" y2="119" stroke="var(--line)" strokeWidth="1" />
        <path
          d="M0 110 H480 V10 H500 V20 H520 V25 H580 V46 H600"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="kv" style={{ marginTop: -6 }}>
        <span className="data">Nov 1</span>
        <span className="data muted">Nov 16</span>
      </div>
      {live.error ? (
        <span className="body-s" style={{ color: "var(--failed)" }}>
          {live.error}
        </span>
      ) : null}
      <div className="tile-foot">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/pay" className="sx-btn sx-btn--primary">
            Pay someone
          </Link>
          <Link href="/receive" className="sx-btn sx-btn--secondary">
            Add money
          </Link>
          <Link href="/team/ana/methods/new" className="sx-btn sx-btn--secondary">
            Give someone a card
          </Link>
        </div>
      </div>
    </section>
  )
}
