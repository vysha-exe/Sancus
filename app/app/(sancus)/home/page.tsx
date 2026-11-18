"use client"

import Link from "next/link"
import { HomeBalance } from "@/components/sancus-ui/home-balance"
import { LatestPayments } from "@/components/sancus-ui/latest-payments"
import { NeedsYou } from "@/components/sancus-ui/needs-you"
import { ConvertCard } from "@/components/sancus-ui/convert-card"
import { GatewayCard } from "@/components/sancus-ui/gateway-card"
import {
  agents,
  bills,
  monthStats,
  teamSpending,
  workspace,
} from "@/lib/sancus/demo-data"
import { useWorkspace } from "@/lib/sancus/use-workspace"

export default function HomePage() {
  const ws = useWorkspace()
  const personal = ws.ready ? ws.isPersonal : !ws.hasBusiness

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Good morning, {workspace.actor.firstName}</h1>
          {!personal && ws.activeNode ? (
            <span className="scope">{ws.activeNode.name}{ws.activeNode.children.length ? " and below" : ""}</span>
          ) : null}
        </div>
        <span className="body-s muted">Monday, November 16</span>
      </header>

      <div className="grid">
        <HomeBalance />

        {personal ? (
          <section className="tile s4" aria-labelledby="local">
            <div className="tile-head">
              <h2 className="tile-title" id="local">
                Get paid locally
              </h2>
            </div>
            <div className="kv">
              <span>Pix, QRIS, PromptPay</span>
              <span className="body-s muted">On Receive</span>
            </div>
            <div className="tile-foot">
              <Link href="/receive" className="sx-btn sx-btn--quiet">
                Show QR
              </Link>
            </div>
          </section>
        ) : (
          <NeedsYou />
        )}

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
          {!personal ? (
            <div className="kv">
              <span>Held for cards</span>
              <span style={{ color: "var(--held)" }}>{monthStats.held}</span>
            </div>
          ) : null}
        </section>

        <ConvertCard />

        <GatewayCard />

        {personal ? (
          <section className="tile s4" aria-labelledby="biz">
            <h2 className="tile-title" id="biz">
              Run a business?
            </h2>
            <p className="body-s muted" style={{ margin: 0 }}>
              Open a company account for teammates, branches and approval rules. Your personal balance stays separate.
            </p>
            <div className="tile-foot">
              <Link href="/branches" className="sx-btn sx-btn--secondary sx-btn--sm">
                Open a business
              </Link>
            </div>
          </section>
        ) : (
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
                <div className="meter" role="progressbar" aria-valuenow={row.pct} aria-valuemin={0} aria-valuemax={100}>
                  <i style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
            <div className="tile-foot">
              <span className="body-s muted">3 of 5 methods, most used first</span>
            </div>
          </section>
        )}

        {!personal ? (
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
        ) : null}

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
            <div className="meter meter--held" role="progressbar" aria-valuenow={25} aria-valuemin={0} aria-valuemax={100}>
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
      </div>
    </div>
  )
}
