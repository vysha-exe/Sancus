"use client"

// Home › Needs you: the oldest payments waiting for approval (live, or demo when signed out).
import Link from "next/link"
import { useLiveApprovals } from "@/lib/sancus/use-live-approvals"

export function NeedsYou() {
  const { waiting, loading } = useLiveApprovals()
  const oldest = waiting.slice(0, 3)
  return (
    <section className="tile s4" aria-labelledby="needs">
      <div className="tile-head">
        <h2 className="tile-title" id="needs">
          Needs you
        </h2>
        <span className={`sx-pill ${waiting.length ? "sx-pill--pending" : "sx-pill--settled"}`}>
          {loading ? "***" : `${waiting.length} waiting`}
        </span>
      </div>
      {loading ? (
        <div className="sx-rows" aria-busy="true" aria-label="Loading approvals">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="sx-row" key={index}>
              <span className="sx-row__who">***</span>
              <span className="sx-row__amount">***</span>
              <span className="sx-row__meta">***</span>
              <span />
            </div>
          ))}
        </div>
      ) : oldest.length === 0 ? (
        <div className="empty home-needs-empty">
          <span className="home-needs-empty__mark" aria-hidden>✓</span>
          <strong>You&apos;re all caught up</strong>
          <span>New approvals and account issues will appear here.</span>
        </div>
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
        <span className="body-s muted">{loading ? "***" : waiting.length ? `Showing ${Math.min(3, waiting.length)} oldest` : "No action required"}</span>
        <Link href="/activity/approvals" className="sx-btn sx-btn--quiet">
          Review all
        </Link>
      </div>
    </section>
  )
}
