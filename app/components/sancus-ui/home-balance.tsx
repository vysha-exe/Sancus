"use client"

import Link from "next/link"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"

export function HomeBalance() {
  const ws = useWorkspace()
  // Business workspace: that company plus its branches. Personal: your own wallets + Gateway.
  const scope = !ws.ready ? undefined : ws.isPersonal || !ws.activeNode ? null : ws.activeNode.id
  const live = useLiveTreasury(undefined, scope)
  const treasuryCount = scope && ws.activeNode ? 1 + ws.activeNode.children.length : null

  return (
    <section className="tile s8 home-balance" aria-labelledby="bal" aria-busy={live.loading}>
      <div className="tile-head">
        <div>
          <span className="sx-label" id="bal">Available to move</span>
          <span className="body-s muted">Across your active treasury scope</span>
        </div>
        {live.source === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
      </div>
      <div className="home-balance__body">
        <div className="sx-balance">
          <span className="sx-balance__amount">
            {live.loading ? "***" : live.availableLabel} <small>USD</small>
          </span>
          <span className="sx-balance__meta">{live.loading ? "***" : live.meta}</span>
        </div>
        <div className="home-balance__scope">
          <span className="home-balance__scope-mark" aria-hidden />
          <div>
            <strong>{treasuryCount ? `${treasuryCount} treasury ${treasuryCount === 1 ? "account" : "accounts"}` : "Available now"}</strong>
            <span>{scope && ws.activeNode ? `${ws.activeNode.name} and direct branches` : "Ready for payments and transfers"}</span>
          </div>
        </div>
      </div>
      {live.error ? (
        <span className="body-s" style={{ color: "var(--failed)" }}>
          {live.error}
        </span>
      ) : null}
      <div className="tile-foot home-balance__actions">
        <Link href="/pay" className="sx-btn sx-btn--primary">Make a payment</Link>
        <Link href="/receive" className="sx-btn sx-btn--secondary">Add money</Link>
        <Link href="/team/ana/methods/new" className="sx-btn sx-btn--quiet">Issue a card</Link>
      </div>
    </section>
  )
}
