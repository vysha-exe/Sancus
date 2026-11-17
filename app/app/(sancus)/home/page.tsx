import Link from "next/link"
import { HomeBalance } from "@/components/sancus-ui/home-balance"
import { LatestPayments } from "@/components/sancus-ui/latest-payments"
import { NeedsYou } from "@/components/sancus-ui/needs-you"
import {
  agents,
  bills,
  monthStats,
  teamSpending,
  workspace,
} from "@/lib/sancus/demo-data"

export default function HomePage() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Good morning, {workspace.actor.firstName}</h1>
        </div>
        <span className="body-s muted">Monday, November 16</span>
      </header>

      <div className="grid">
        <HomeBalance />

        <NeedsYou />

        <section className="tile s8 r2" aria-labelledby="latest">
          <div className="tile-head">
            <h2 className="tile-title" id="latest">
              Latest payments
            </h2>
            <Link href="/activity" className="sx-btn sx-btn--quiet">
              See all
            </Link>
          </div>
          <LatestPayments />
        </section>

        <section className="tile s4" aria-labelledby="month">
          <div className="tile-head">
            <h2 className="tile-title" id="month">
              This month
            </h2>
            <span className="body-s muted">{monthStats.label}</span>
          </div>
          <div className="kv">
            <span>Money in</span>
            <span style={{ color: "var(--settled)" }}>{monthStats.moneyIn}</span>
          </div>
          <div className="kv">
            <span>Money out</span>
            <span>{monthStats.moneyOut}</span>
          </div>
          <div className="kv">
            <span>Fees</span>
            <span>{monthStats.fees}</span>
          </div>
          <div className="kv">
            <span>Held for cards</span>
            <span style={{ color: "var(--held)" }}>{monthStats.held}</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="spend">
          <div className="tile-head">
            <h2 className="tile-title" id="spend">
              Team spending
            </h2>
            <Link href="/spending" className="sx-btn sx-btn--quiet">
              See all
            </Link>
          </div>
          {teamSpending.map((row) => (
            <div key={row.who} style={{ display: "grid", gap: 6 }}>
              <div className="kv">
                <span className="trunc">{row.who}</span>
                <span>{row.used}</span>
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-valuenow={row.pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <i style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
          <div className="tile-foot">
            <span className="body-s muted">3 of 5 methods, most used first</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="bills">
          <div className="tile-head">
            <h2 className="tile-title" id="bills">
              Bills due soon
            </h2>
            <Link href="/invoices" className="sx-btn sx-btn--quiet">
              Invoices
            </Link>
          </div>
          <div className="sx-rows">
            {bills.map((b) => (
              <Link key={b.who} href="/invoices" className="sx-row">
                <span className="sx-row__who">{b.who}</span>
                <span className="sx-row__amount">{b.amount}</span>
                <span className="sx-row__meta">
                  <span className="sx-rail">{b.rail}</span>
                  {b.meta}
                </span>
                <span className="sx-row__status">
                  <span className="sx-pill sx-pill--pending">{b.status}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="tile-foot">
            <span className="body-s muted">About $3,003.68 together</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="agents">
          <div className="tile-head">
            <h2 className="tile-title" id="agents">
              Agents
            </h2>
            <Link href="/agents" className="sx-btn sx-btn--quiet">
              Open
            </Link>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="kv">
              <span>Payments agent</span>
              <span>{agents.budgetLabel}</span>
            </div>
            <div
              className="meter meter--held"
              role="progressbar"
              aria-valuenow={25}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: "25%" }} />
            </div>
          </div>
          <div className="kv">
            <span>Earned from your price feed</span>
            <span style={{ color: "var(--settled)" }}>{agents.earned}</span>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">{agents.resets}</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="ask">
          <div className="tile-head">
            <h2 className="tile-title" id="ask">
              Ask Sancus
            </h2>
          </div>
          <label>
            <span className="vh">Ask a question</span>
            <input className="sx-field__input" placeholder="What's due next week?" />
          </label>
          <div className="filters">
            <Link href="/agents" className="chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              What needs approval?
            </Link>
            <Link href="/agents" className="chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Spend in Brazil
            </Link>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">Answers link to the payment</span>
          </div>
        </section>
      </div>
    </div>
  )
}
