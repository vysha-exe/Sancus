"use client"

import Link from "next/link"
import { HomeBalance } from "@/components/sancus-ui/home-balance"
import { LatestPayments } from "@/components/sancus-ui/latest-payments"
import { NeedsYou } from "@/components/sancus-ui/needs-you"
import { ConvertCard } from "@/components/sancus-ui/convert-card"
import { GatewayCard } from "@/components/sancus-ui/gateway-card"
import {
  bills,
  monthStats,
  teamSpending,
  workspace,
} from "@/lib/sancus/demo-data"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { useAccount } from "@/lib/sancus/use-account"
import { countryByCode } from "@/lib/sancus/countries"
import type { CompanyNode } from "@/lib/sancus/companies"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"

export default function HomePage() {
  const ws = useWorkspace()
  const { account } = useAccount()
  const personal = account?.type === "ADMIN"
    ? false
    : account?.type === "INDIVIDUAL"
      ? true
      : ws.ready
        ? ws.isPersonal
        : !ws.hasBusiness
  const displayName = account?.type === "ADMIN"
    ? "Admin"
    : account?.firstName || account?.email?.split("@")[0] || workspace.actor.firstName

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Good morning, {displayName}</h1>
          {!personal && ws.activeNode ? (
            <span className="scope">{ws.activeNode.name}{ws.activeNode.children.length ? " and below" : ""}</span>
          ) : null}
        </div>
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

        {account?.type === "ADMIN" ? (
          <ParentBranchBalances tree={ws.tree} ready={ws.ready} formatBalance={ws.formatBalance} />
        ) : null}

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

      </div>
    </div>
  )
}

function ParentBranchBalances({
  tree,
  ready,
  formatBalance,
}: {
  tree: CompanyNode[]
  ready: boolean
  formatBalance: (minor: string) => string
}) {
  const parent = tree[0] ?? null
  const normalizedParentName = parent?.name.trim().toLowerCase() ?? ""
  const duplicateParents = tree.filter((node) => node.name.trim().toLowerCase() === normalizedParentName)
  const parentBalanceMinor = duplicateParents.reduce((sum, node) => sum + BigInt(node.ownMinor), 0n).toString()
  const flattenBranches = (nodes: CompanyNode[]): CompanyNode[] => nodes.flatMap((node) => [node, ...flattenBranches(node.children)])
  const branches = [
    ...(parent ? flattenBranches(parent.children) : []),
    ...tree.slice(1).flatMap((node) =>
      node.name.trim().toLowerCase() === normalizedParentName ? flattenBranches(node.children) : flattenBranches([node])
    ),
  ].filter((node, index, all) => all.findIndex((candidate) => candidate.id === node.id) === index)
  const rows = parent
    ? [{ node: parent, level: "Parent", balanceMinor: parentBalanceMinor }, ...branches.map((node) => ({ node, level: "Branch", balanceMinor: node.ownMinor }))]
    : []

  return (
    <section className="tile s12" aria-labelledby="branch-balances" aria-busy={!ready}>
      <div className="tile-head">
        <div>
          <h2 className="tile-title" id="branch-balances">Branch balances</h2>
          <span className="body-s muted">Parent company and direct country branches</span>
        </div>
        <Link href="/branches" className="sx-btn sx-btn--quiet">Manage branches</Link>
      </div>
      {!ready ? (
        <div className="fill-grid">
          <div className="rail-tile"><span className="sx-label">Loading</span><span className="big">***</span></div>
        </div>
      ) : rows.length ? (
        <div className="fill-grid">
          {rows.map(({ node, level, balanceMinor }) => {
            const isParent = level === "Parent"
            return (
            <Link
              href={`/branches/${node.id}`}
              className="rail-tile"
              style={{ color: "inherit", textDecoration: "none" }}
              key={node.id}
            >
              <div className="tile-head" style={{ margin: 0 }}>
                <span className="sx-label">{level}</span>
                {!isParent ? <span aria-hidden>{countryByCode(node.country)?.flag ?? "🏳️"}</span> : null}
              </div>
              <span className="body-strong">{node.name}</span>
              <span className="big">{formatBalance(balanceMinor)}</span>
              <span className="body-s muted">
                {isParent ? "Global treasury · USDC" : `${countryByCode(node.country)?.name ?? node.country} · ${node.currency}`}
              </span>
              {!isParent ? <span className="body-strong">{localBalance(balanceMinor, node.currency)}</span> : null}
            </Link>
            )
          })}
        </div>
      ) : (
        <div className="empty">No company branches yet.</div>
      )}
    </section>
  )
}

function localBalance(usdcMinor: string, currency: string): string {
  const rate = FIXED_USD_RATES[currency as keyof typeof FIXED_USD_RATES]
  if (!rate) return `Local balance unavailable · ${currency}`
  const localAmount = Number(BigInt(usdcMinor)) / 1_000_000 * rate
  const zeroDecimal = new Set(["IDR", "JPY", "KRW", "VND"])
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: zeroDecimal.has(currency) ? 0 : 2,
    maximumFractionDigits: zeroDecimal.has(currency) ? 0 : 2,
  }).format(localAmount)
  return `${formatted} ${currency} at the fixed demo rate`
}
