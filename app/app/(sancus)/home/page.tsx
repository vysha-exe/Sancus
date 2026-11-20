"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { HomeBalance, type HomeTreasuryPositions } from "@/components/sancus-ui/home-balance"
import { LatestPayments } from "@/components/sancus-ui/latest-payments"
import { NeedsYou } from "@/components/sancus-ui/needs-you"
import {
  bills,
  monthStats,
  teamSpending,
  workspace,
} from "@/lib/sancus/demo-data"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { accountDisplayName, useAccount } from "@/lib/sancus/use-account"
import { countryByCode } from "@/lib/sancus/countries"
import type { CompanyNode } from "@/lib/sancus/companies"
import { calculateCompanyNodeTotal } from "@/lib/sancus/company-total"
import { useSancusPrefs } from "@/lib/sancus/prefs"

function decimalUsdcMinor(value: string): string {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) return "0"
  return (BigInt(match[1]) * 1_000_000n + BigInt(`${match[2] ?? ""}000000`.slice(0, 6))).toString()
}

export default function HomePage() {
  const ws = useWorkspace()
  const { account } = useAccount()
  // Guest demo and signed-in ADMIN: always the company dashboard (never "Personal").
  const isAdmin = !account || account.type === "ADMIN"
  const personal = isAdmin ? false : ws.ready ? ws.isPersonal : !ws.hasBusiness
  const activeName = ws.activeNode?.name ?? accountDisplayName(account, workspace.name)
  const showBranchOverview = !personal && ws.activeNode?.parentId === null
  const [rootAssets, setRootAssets] = useState<(HomeTreasuryPositions & { companyId: string }) | null>(null)
  const rootCompanyId = showBranchOverview ? ws.activeNode?.id ?? null : null

  useEffect(() => {
    if (!rootCompanyId) return
    let cancelled = false
    void (async () => {
      try {
        const [rootResponse, equityResponse, yieldResponse] = await Promise.all([
          fetch("/api/sancus/treasury/root", { cache: "no-store" }),
          fetch("/api/sancus/treasury/equities", { cache: "no-store" }).catch(() => null),
          fetch("/api/sancus/treasury/yield", { cache: "no-store" }).catch(() => null),
        ])
        if (!rootResponse.ok) return
        const root = await rootResponse.json() as { assets?: { fUsdcMinor?: string } }
        const equity = equityResponse?.ok
          ? await equityResponse.json() as { portfolio?: { symbol: string; valueMinor: string }[] }
          : null
        const earn = yieldResponse?.ok
          ? await yieldResponse.json() as {
              vaults?: { vaultAddress: string; name: string; protocol: string }[]
              positions?: { vaultAddress: string; currentBalance: string }[]
            }
          : null
        if (cancelled || root.assets?.fUsdcMinor === undefined) return
        const yieldPositions = (earn?.vaults ?? []).map((vault) => {
          const current = earn?.positions?.find((item) => item.vaultAddress.toLowerCase() === vault.vaultAddress.toLowerCase())
          return { ...vault, valueMinor: decimalUsdcMinor(current?.currentBalance ?? "0") }
        })
        setRootAssets({
          companyId: rootCompanyId,
          fUsdcMinor: String(root.assets.fUsdcMinor),
          equities: equity?.portfolio?.map((item) => ({ symbol: item.symbol, valueMinor: String(item.valueMinor) })) ?? [],
          yield: yieldPositions.map((item) => ({ name: item.name, protocol: item.protocol, valueMinor: item.valueMinor })),
        })
      } catch {
        // The bank-first dashboard remains usable if an optional Treasury provider is unavailable.
      }
    })()
    return () => { cancelled = true }
  }, [rootCompanyId])
  const positions = rootAssets?.companyId === rootCompanyId ? rootAssets : null

  return (
    <div className="page home-page">
      <header className="home-head">
        <div className="home-head__copy">
          <span className="sx-label">
            {personal ? "Personal account · United States" : showBranchOverview ? "Global treasury" : "Branch workspace"}
          </span>
          <h1 className="sx-h heading-2">
            {personal ? `Good morning, ${account?.type === "INDIVIDUAL" && account.firstName ? account.firstName : activeName}` : activeName}
          </h1>
          <p className="body-s muted">
            {personal
              ? "Your balance, payments, and spending in one place."
              : showBranchOverview
                ? "Monitor the treasury, direct branches, and recent money movement."
                : "Monitor this branch, its payments, and available funds."}
          </p>
        </div>
      </header>

      <div className="grid home-dashboard">
        <HomeBalance positions={positions} />

        <NeedsYou />

        {showBranchOverview ? (
          <ParentBranchBalances tree={ws.tree} ready={ws.ready && ws.balancesReady} formatBalance={ws.formatBalance} positions={positions} />
        ) : null}

        <section className={`tile s8${personal ? " r2" : ""}`} aria-labelledby="latest">
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

        {personal ? (
          <section className="tile s4" aria-labelledby="quick">
            <div className="tile-head">
              <h2 className="tile-title" id="quick">
                Pay or get paid
              </h2>
            </div>
            <Link href={personal ? "/pay/scan-personal" : "/pay/scan"} className="kv" style={{ color: "inherit", textDecoration: "none" }}>
              <span>Scan a QR code</span>
              <span className="body-s muted">Pix, PromptPay, QRIS, cards</span>
            </Link>
            <Link href="/pay/us-bank" className="kv" style={{ color: "inherit", textDecoration: "none" }}>
              <span>Enter bank details</span>
              <span className="body-s muted">US bank by ACH</span>
            </Link>
            <Link href="/pay" className="kv" style={{ color: "inherit", textDecoration: "none" }}>
              <span>Pay a friend</span>
              <span className="body-s muted">Saved payees</span>
            </Link>
            <div className="tile-foot">
              <Link href="/receive" className="sx-btn sx-btn--quiet">
                Show my QR
              </Link>
            </div>
          </section>
        ) : null}

        {showBranchOverview ? (
          <CompanySnapshot tree={ws.tree} ready={ws.ready && ws.balancesReady} />
        ) : (
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
        )}

        {!personal && !showBranchOverview ? (
          <>
            <section className="tile s6" aria-labelledby="spend">
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

            <section className="tile s6" aria-labelledby="bills">
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
          </>
        ) : null}
      </div>
    </div>
  )
}
function ParentBranchBalances({
  tree,
  ready,
  formatBalance,
  positions,
}: {
  tree: CompanyNode[]
  ready: boolean
  formatBalance: (minor: string) => string
  positions: HomeTreasuryPositions | null
}) {
  const { debugMode } = useSancusPrefs()
  const parent = tree.find((node) => node.parentId === null) ?? tree[0] ?? null
  const branches = parent?.children ?? []
  const rows = parent
    ? [{ node: parent, level: "Parent" }, ...branches.map((node) => ({ node, level: "Branch" }))]
    : []
  const bankMoney = (node: CompanyNode) => {
    const balanceMinor = node.bankBalance?.balanceMinor ?? "0"
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: node.bankBalance?.currency ?? node.currency,
      maximumFractionDigits: (node.bankBalance?.currency ?? node.currency) === "IDR" ? 0 : 2,
    }).format(Number(balanceMinor) / 100)
  }
  const combinedMoney = (node: CompanyNode, reportingCurrency = node.currency) => {
    const total = calculateCompanyNodeTotal(node, reportingCurrency)
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: total.currency,
      maximumFractionDigits: total.currency === "IDR" ? 0 : 2,
    }).format(Number(total.totalMinor) / 1_000_000)
  }
  const positionMoney = (minor: bigint | string) => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(BigInt(minor)) / 1_000_000)
  const equityMinor = positions?.equities.reduce((sum, item) => sum + BigInt(item.valueMinor), 0n) ?? 0n
  const yieldMinor = positions?.yield.reduce((sum, item) => sum + BigInt(item.valueMinor), 0n) ?? 0n
  const equitySymbols = positions?.equities.filter((item) => BigInt(item.valueMinor) > 0n).map((item) => item.symbol).join(" · ") || "No positions"
  const yieldNames = [...new Set(positions?.yield.filter((item) => BigInt(item.valueMinor) > 0n).map((item) => item.protocol || item.name) ?? [])].join(" · ") || "No positions"

  return (
    <section className="tile s12 home-branches" aria-labelledby="branch-balances" aria-busy={!ready}>
      <div className="tile-head">
        <div>
          <h2 className="tile-title" id="branch-balances">Treasury by branch</h2>
          <span className="body-s muted">One global treasury with direct country branches</span>
        </div>
        <Link href="/branches" className="sx-btn sx-btn--quiet">Manage branches</Link>
      </div>
      {!ready ? (
        <div className="home-branch-grid"><div className="home-branch-card"><span className="sx-label">Loading</span><span className="big">***</span></div></div>
      ) : rows.length ? (
        <div className="home-branch-grid">
          {rows.map(({ node, level }) => {
            const isParent = level === "Parent"
            return (
              <Link href={`/branches/${node.id}`} className={`home-branch-card${isParent ? " home-branch-card--treasury" : ""}`} key={node.id}>
                <div className="home-branch-card__head">
                  <span className="home-branch-card__kind">{isParent ? "Treasury" : "Branch"}</span>
                  <span className="home-branch-card__flag" aria-hidden>{isParent ? "HQ" : countryByCode(node.country)?.flag ?? "🏳️"}</span>
                </div>
                <div className="home-branch-card__identity">
                  <strong>{node.name}</strong>
                  <span>{isParent ? `Global treasury · ${node.bankBalance?.currency ?? node.currency}` : `${countryByCode(node.country)?.name ?? node.country} · ${node.currency}`}</span>
                </div>
                <div className="home-branch-card__balance">
                  <span>{combinedMoney(node)}</span>
                  <small>USD equivalent · {combinedMoney(node, "USD")}</small>
                  {debugMode ? (
                    <div className="home-branch-card__breakdown">
                      <small>Bank · {bankMoney(node)} · {node.bankBalance?.bankName ?? "Local bank"}</small>
                      <small>Wallet · {formatBalance(node.ownMinor)} USDC · {node.wallets.length} {node.wallets.length === 1 ? "wallet" : "wallets"}</small>
                    </div>
                  ) : null}
                </div>
                <span className="home-branch-card__open" aria-hidden>Open →</span>
              </Link>
            )
          })}
        </div>
      ) : <div className="empty">No company branches yet.</div>}
      {ready && positions ? (
        <div className="home-treasury-positions" aria-label="Parent Treasury positions">
          <div className="home-treasury-positions__head">
            <div>
              <span className="home-branch-card__kind">Parent Treasury positions</span>
              <p className="body-s muted">Managed centrally by {parent?.name ?? "the parent company"}; branch operating balances stay separate.</p>
            </div>
            <Link href="/treasury" className="sx-btn sx-btn--quiet">Manage Treasury</Link>
          </div>
          <div className="home-treasury-positions__grid">
            <div className="home-treasury-position">
              <span className="sx-label">Internal liquidity</span>
              <strong>{positionMoney(positions.fUsdcMinor)}</strong>
              <small>fUSDC</small>
            </div>
            <div className="home-treasury-position">
              <span className="sx-label">Tokenized stocks</span>
              <strong>{positionMoney(equityMinor)}</strong>
              <small>{equitySymbols}</small>
            </div>
            <div className="home-treasury-position">
              <span className="sx-label">Yield positions</span>
              <strong>{positionMoney(yieldMinor)}</strong>
              <small>{yieldNames}</small>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
function CompanySnapshot({ tree, ready }: { tree: CompanyNode[]; ready: boolean }) {
  const parent = tree.find((node) => node.parentId === null) ?? tree[0] ?? null
  const branches = parent?.children ?? []
  const wallets = parent ? parent.wallets.length + branches.reduce((total, branch) => total + branch.wallets.length, 0) : 0
  const currencies = new Set(branches.map((branch) => branch.currency)).size

  return (
    <section className="tile s4 home-network" aria-labelledby="network" aria-busy={!ready}>
      <div className="tile-head">
        <div>
          <h2 className="tile-title" id="network">Treasury network</h2>
          <span className="body-s muted">Live company structure</span>
        </div>
        <span className="sx-pill sx-pill--settled">Live</span>
      </div>
      <div className="home-network__metric">
        <span>{ready ? branches.length : "***"}</span>
        <small>Direct branches</small>
      </div>
      <div className="home-network__rows">
        <div className="kv"><span>Connected wallets</span><span>{ready ? wallets : "***"}</span></div>
        <div className="kv"><span>Local currencies</span><span>{ready ? currencies : "***"}</span></div>
        <div className="kv"><span>Structure</span><span>HQ + branches</span></div>
      </div>
      <div className="tile-foot">
        <span className="body-s muted">No nested sub-branches</span>
        <Link href="/branches" className="sx-btn sx-btn--quiet">View structure</Link>
      </div>
    </section>
  )
}
CompanySnapshot.displayName = "CompanySnapshot"
