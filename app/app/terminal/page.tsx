import Link from "next/link"
import { COUNTRIES, RAILS, VENDORS, formatMoney } from "@/lib/sancus/cross-rail"

// Pick a sandbox vendor to open its terminal (put it on a second screen, then scan it from a personal account).
export default function TerminalIndex() {
  return (
    <div className="xt-wrap">
      <div className="xt-top">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sx-label">Sancus sandbox</span>
          <h1 className="sx-h heading-2" style={{ margin: 0 }}>
            Vendor terminals
          </h1>
          <p className="body-s muted" style={{ margin: 0, maxWidth: "60ch" }}>
            Each terminal is a mock shop on its own local rail. Open one on a second screen, charge an amount, then pay it
            from a personal Sancus account with any rail you like.
          </p>
        </div>
        <span className="sx-pill sx-pill--simulated">Sandbox</span>
      </div>
      <div className="xt-grid">
        {VENDORS.map((v) => (
          <Link key={v.id} href={`/terminal/${v.id}`} className="tile xt-pick">
            <div className="xr-vendor">
              <span className="xr-avatar" aria-hidden>
                {v.initials}
              </span>
              <div>
                <span className="body-strong">{v.name}</span>
                <span className="body-s muted">{v.category}</span>
              </div>
            </div>
            <div className="kv">
              <span>{v.city}</span>
              <span>{formatMoney(Number(v.sampleAmount), COUNTRIES[v.country].currency)}</span>
            </div>
            <div className="filters">
              <span className="xr-rail xr-rail--b">{RAILS[v.rail].label}</span>
              <span className="xr-rail">Paid out by {COUNTRIES[v.country].partnerBank}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
