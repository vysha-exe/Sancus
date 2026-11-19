"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { calculateCompanyTotal } from "@/lib/sancus/company-total"

type BalancePoint = { at: number; minor: string }

export type HomeTreasuryPositions = {
  fUsdcMinor: string
  equities: { symbol: string; valueMinor: string }[]
  yield: { name: string; protocol: string; valueMinor: string }[]
}

const HISTORY_PREFIX = "sancus:balance-history:v1:"
const HISTORY_DAYS = 30

function moneyFromMinor(minor: string) {
  return Number(minor) / 1_000_000
}

function observedHistoryKey(scope: string | null) {
  return `${HISTORY_PREFIX}${scope ? `company:${scope}` : "personal"}`
}

function readObservedHistory(key: string): BalancePoint[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as BalancePoint[]
    const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
    return value.filter((point) => Number.isFinite(point.at) && point.at >= cutoff && /^-?\d+$/.test(point.minor))
  } catch {
    return []
  }
}

function BalanceHistoryChart({
  scope,
  currentMinor,
  label = "Balance history",
}: {
  scope: string | null
  currentMinor: string | null
  label?: string
}) {
  const [points, setPoints] = useState<BalancePoint[]>([])

  useEffect(() => {
    if (currentMinor === null) return
    const key = observedHistoryKey(scope)
    const stored = readObservedHistory(key)
    const last = stored.at(-1)
    const now = Date.now()
    const next = !last || last.minor !== currentMinor || now - last.at >= 12 * 60 * 60 * 1000
      ? [...stored, { at: now, minor: currentMinor }].slice(-90)
      : stored
    if (next !== stored) window.localStorage.setItem(key, JSON.stringify(next))
    // The chart deliberately hydrates from browser-local observed balances.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPoints(next)
  }, [currentMinor, scope])

  const chart = useMemo(() => {
    if (!points.length) return null
    const values = points.map((point) => moneyFromMinor(point.minor))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min
    const width = 600
    const left = 10
    const right = 590
    const top = 12
    const bottom = 106
    const coordinates = values.map((value, index) => {
      const x = values.length === 1 ? right : left + (index / (values.length - 1)) * (right - left)
      const y = span === 0 ? 62 : bottom - ((value - min) / span) * (bottom - top)
      return { x, y }
    })
    const line = points.length === 1
      ? `M ${left} ${coordinates[0].y} L ${right} ${coordinates[0].y}`
      : coordinates.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ")
    const last = coordinates.at(-1) ?? { x: right, y: 62 }
    return { line, last, firstAt: points[0].at, lastAt: points.at(-1)?.at ?? points[0].at, width }
  }, [points])

  const dateLabel = (at: number) => new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })

  return (
    <div className="home-balance-chart">
      <div className="home-balance-chart__head">
        <span className="sx-label">{label}</span>
        <span className="body-s muted">Last {HISTORY_DAYS} days · observed balances</span>
      </div>
      <svg viewBox="0 0 600 120" preserveAspectRatio="none" role="img" aria-label="Observed treasury balance history">
        <line x1="10" y1="107" x2="590" y2="107" className="home-balance-chart__axis" />
        {chart ? (
          <>
            <path d={chart.line} className="home-balance-chart__line" />
            <circle cx={chart.last.x} cy={chart.last.y} r="4" className="home-balance-chart__dot" vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
      </svg>
      <div className="home-balance-chart__dates">
        <span>{chart ? dateLabel(chart.firstAt) : "No history yet"}</span>
        <span>{chart ? dateLabel(chart.lastAt) : ""}</span>
      </div>
    </div>
  )
}

export function HomeBalance({ positions = null }: { positions?: HomeTreasuryPositions | null }) {
  const ws = useWorkspace()
  // Business workspace: that company plus its branches. Personal: your own wallets + Gateway.
  const scope = !ws.ready ? undefined : ws.isPersonal || !ws.activeNode ? null : ws.activeNode.id
  const live = useLiveTreasury(undefined, scope)
  const bank = scope && ws.activeNode ? ws.activeNode.bankBalance : null
  const bankLoading = Boolean(scope && !ws.balancesReady)
  const companyTotal = scope && ws.activeNode && ws.balancesReady
    ? calculateCompanyTotal(ws.activeNode, positions)
    : null
  const companyTotalLabel = companyTotal
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: companyTotal.currency,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: companyTotal.currency === "IDR" ? 0 : 2,
      }).format(Number(companyTotal.totalMinor) / 1_000_000)
    : null
  const companyMeta = companyTotal
    ? `${companyTotal.bankAccounts} bank ${companyTotal.bankAccounts === 1 ? "account" : "accounts"} · ${companyTotal.wallets} ${companyTotal.wallets === 1 ? "wallet" : "wallets"} · ${companyTotal.companies} company ${companyTotal.companies === 1 ? "account" : "accounts"}`
    : ""

  return (
    <section className="tile s8 home-balance" aria-labelledby="bal" aria-busy={live.loading || bankLoading}>
      <div className="tile-head">
        <div>
          <span className="sx-label" id="bal">{bank ? "Total company balance" : "Available to move"}</span>
          <span className="body-s muted">{bank ? "Bank accounts, wallets, and parent Treasury positions" : "Across your active treasury scope"}</span>
        </div>
        {live.source === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
      </div>
      <div className="home-balance__body">
        <div className="sx-balance">
          <span className="sx-balance__amount">
            {bankLoading ? "***" : companyTotalLabel ?? (live.loading ? "***" : live.availableLabel)} <small>{companyTotal?.currency ?? "USD"}</small>
          </span>
          <span className="sx-balance__meta">{bankLoading ? "***" : bank ? companyMeta : live.loading ? "***" : live.meta}</span>
        </div>
      </div>
      <BalanceHistoryChart
        scope={companyTotal && scope ? `${scope}:company-total:${companyTotal.currency}` : scope ?? null}
        currentMinor={companyTotal?.totalMinor ?? live.summary?.availableMinor ?? null}
        label={companyTotal ? "Company balance history" : "Balance history"}
      />
      {live.error ? (
        <span className="body-s" style={{ color: "var(--failed)" }}>
          {live.error}
        </span>
      ) : null}
      <div className="tile-foot home-balance__actions">
        <Link href="/pay" className="sx-btn sx-btn--primary">Make a payment</Link>
        <Link href="/receive" className="sx-btn sx-btn--secondary">Add money</Link>
        <Link href="/team" className="sx-btn sx-btn--quiet">Issue a card</Link>
      </div>
    </section>
  )
}
