"use client"

// Home › Latest payments: live payouts from the backend, demo rows when there are none.
import { PaymentRow } from "@/components/sancus-ui/payment-row"
import { latestPayments } from "@/lib/sancus/demo-data"
import { useLiveActivity } from "@/lib/sancus/use-live-activity"

const CAP = 5

export function LatestPayments() {
  const { source, payments, loading } = useLiveActivity()
  const rows = source === "live" ? payments : latestPayments

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
