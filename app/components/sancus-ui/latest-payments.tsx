"use client"

// Home › Latest payments: live payouts from the backend (empty until the first payment).
import Link from "next/link"
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { useLiveActivity } from "@/lib/sancus/use-live-activity"

const CAP = 5

export function LatestPayments() {
  const { payments, loading } = useLiveActivity()
  const rows = payments

  if (loading) {
    return (
      <>
        <div className="sx-rows" aria-busy="true" aria-label="Loading payments">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="sx-row" key={index}>
              <span className="sx-row__who">***</span>
              <span className="sx-row__amount">***</span>
              <span className="sx-row__meta">***</span>
              <span className="sx-row__status">***</span>
            </div>
          ))}
        </div>
        <div className="tile-foot" style={{ marginTop: "auto" }}>
          <span className="body-s muted">***</span>
        </div>
      </>
    )
  }

  if (rows.length === 0) {
    return (
      <>
        <div className="empty" style={{ minHeight: 120 }}>
          Nothing here yet. Your first payment will show up here.
          <Link href="/pay" className="sx-btn sx-btn--secondary sx-btn--sm">
            Pay someone
          </Link>
        </div>
        <div className="tile-foot" style={{ marginTop: "auto" }}>
          <span className="body-s muted">0 payments</span>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="sx-rows">
        {rows.slice(0, CAP).map((p) => (
          <PaymentRow key={p.id} payment={p} />
        ))}
      </div>
      <div className="tile-foot" style={{ marginTop: "auto" }}>
        <span className="body-s muted">
          {Math.min(CAP, rows.length)} of {rows.length}
        </span>
      </div>
    </>
  )
}
