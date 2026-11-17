"use client"

// Home › Needs you: the oldest payments waiting for approval (live, or demo when signed out).
import Link from "next/link"
import { useLiveApprovals } from "@/lib/sancus/use-live-approvals"

export function NeedsYou() {
  const { waiting } = useLiveApprovals()
  const oldest = waiting.slice(0, 3)
  return (
    <section className="tile s4" aria-labelledby="needs">
      <div className="tile-head">
        <h2 className="tile-title" id="needs">
          Needs you
        </h2>
        <span className={`sx-pill ${waiting.length ? "sx-pill--pending" : "sx-pill--settled"}`}>
          {waiting.length} waiting
        </span>
      </div>
      {oldest.length === 0 ? (
        <div className="empty">Nothing needs you right now.</div>
      ) : (
        <div className="sx-rows">
          {oldest.map((a) => (
            <Link key={a.id} href="/activity/approvals" className="sx-row">
              <span className="sx-row__who">{a.who}</span>
              <span className="sx-row__amount">{a.amountLabel}</span>
              <span className="sx-row__meta">{a.reason}</span>
              <span />
            </Link>
          ))}
        </div>
      )}
      <div className="tile-foot">
        <span className="body-s muted">Shows the {Math.min(3, waiting.length) || 3} oldest</span>
        <Link href="/activity/approvals" className="sx-btn sx-btn--quiet">
          Review all
        </Link>
      </div>
    </section>
  )
}
