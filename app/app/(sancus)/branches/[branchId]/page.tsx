"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { countryByCode } from "@/lib/sancus/countries"
import { FIXED_USD_RATES, fixedUsdRateLabel } from "@/lib/sancus/fixed-rates"
import type { InternalTransferDto } from "@/lib/sancus/internal-transfers"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"
import { setWorkspaceCompany } from "@/lib/sancus/workspace"

type Wallet = {
  walletId: string
  address: string
  usdcMinor: string | null
  local?: Record<string, string>
}

type Account = {
  id: string
  name: string
  country: string | null
  currency: string
  isRoot: boolean
  /** False: shown by name only (e.g. HQ, seen from a branch admin). */
  canSee?: boolean
  /** This user may move money out of this account. */
  canSendFrom?: boolean
  availableMinor: string
  wallet: Wallet | null
  bank: { name: string; label: string; last4: string; simulated: boolean } | null
}

type Member = {
  id: string
  user_id: string | null
  invited_email: string | null
  role: string
  status: string
  per_payment_limit_minor: number | string | null
}

type BranchResponse = {
  branch: Account
  sources: Account[]
  transfers: InternalTransferDto[]
  payouts: PayoutDto[]
  members: Member[]
}

const usd = (minor: string) => `$${displayMinor(BigInt(minor || "0"), USDC_DECIMALS, "", 2)}`

function localLabel(account: Account) {
  if (account.isRoot) return "Global treasury · USDC"
  const rate = FIXED_USD_RATES[account.currency as keyof typeof FIXED_USD_RATES]
  if (!rate) return account.currency
  const value = (Number(BigInt(account.availableMinor || "0")) / 1_000_000) * rate
  return new Intl.NumberFormat(account.currency === "IDR" ? "id-ID" : undefined, {
    style: "currency",
    currency: account.currency,
    maximumFractionDigits: account.currency === "IDR" ? 0 : 2,
  }).format(value)
}

function localTokenLabel(account: Account) {
  const minor = account.wallet?.local?.[account.currency]
  if (!minor) return null
  return `${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} m${account.currency}`
}

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Completed"
  if (status === "PENDING_APPROVAL") return "Waiting for approval"
  if (["FAILED", "DECLINED", "EXPIRED", "REVERSED"].includes(status)) return status.charAt(0) + status.slice(1).toLowerCase()
  return "Moving money"
}

export default function BranchDetailPage() {
  const params = useParams<{ branchId: string }>()
  const branchId = params.branchId
  const [data, setData] = useState<BranchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sancus/branches/${branchId}`, { cache: "no-store" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Could not load this branch")
      setData(body as BranchResponse)
      setError(null)
      setWorkspaceCompany(branchId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this branch")
    } finally {
      setLoading(false)
    }
  }, [branchId])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  if (loading && !data) return <div className="page"><div className="tile"><div className="empty">***</div></div></div>
  if (!data || error) {
    return (
      <div className="page">
        <div className="tile">
          <div className="empty"><b>{error ?? "Branch not found"}</b><Link href="/branches">Back to branches</Link></div>
        </div>
      </div>
    )
  }

  const { branch } = data
  const flag = branch.country ? countryByCode(branch.country)?.flag : null
  const tokenBalance = localTokenLabel(branch)
  const recent = [
    ...data.transfers.map((transfer) => ({ kind: "transfer" as const, at: transfer.createdAt, transfer })),
    ...data.payouts.map((payout) => ({ kind: "payout" as const, at: payout.createdAt, payout })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <Link href="/branches" className="body-s muted">← Branches</Link>
          <h1 className="sx-h heading-2" style={{ marginTop: 8 }}>{flag ? `${flag} ` : ""}{branch.name}</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            {branch.isRoot ? "Country-neutral global treasury" : `${countryByCode(branch.country ?? "")?.name ?? branch.country} operating account`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="sx-btn sx-btn--secondary" onClick={() => setMoveOpen(true)}>Move money</button>
          <Link href="/pay" className="sx-btn sx-btn--primary">Pay</Link>
        </div>
      </header>

      <div className="grid">
        <section className="tile s8" aria-labelledby="branch-treasury">
          <div className="tile-head">
            <div>
              <span className="sx-label">Available treasury</span>
              <h2 id="branch-treasury" className="sx-h heading-2" style={{ margin: "8px 0 0" }}>{usd(branch.availableMinor)}</h2>
            </div>
            <span className="sx-pill sx-pill--settled">Arc testnet</span>
          </div>
          {!branch.isRoot ? (
            <div className="fill-grid">
              <div className="rail-tile">
                <span className="sx-label">Local equivalent</span>
                <span className="big">{localLabel(branch)}</span>
                <span className="body-s muted">{fixedUsdRateLabel(branch.currency as keyof typeof FIXED_USD_RATES)}</span>
              </div>
              <div className="rail-tile">
                <span className="sx-label">Local settlement asset</span>
                <span className="big">{tokenBalance ?? `0 m${branch.currency}`}</span>
                <span className="body-s muted">Test token · no cash value</span>
              </div>
            </div>
          ) : (
            <p className="body-s muted">This balance can fund any country branch. The parent treasury has no local currency or connected bank.</p>
          )}
          <div className="tile-foot">
            <span className="body-s muted">Reserved and in-flight transfers appear in Activity.</span>
            {branch.wallet ? <a className="data" target="_blank" rel="noreferrer" href={`https://explorer.testnet.arc.io/address/${branch.wallet.address}`}>View Arc account ↗</a> : null}
          </div>
        </section>

        <aside className="tile s4" aria-labelledby="connected-bank">
          <div className="tile-head"><h2 id="connected-bank" className="tile-title">Paying from</h2>{branch.bank?.simulated ? <span className="sx-pill sx-pill--simulated">Demo</span> : null}</div>
          {branch.bank ? (
            <>
              <span className="body-strong">{branch.bank.name}</span>
              <span className="big" style={{ fontSize: 26 }}>{branch.bank.label} •••• {branch.bank.last4}</span>
              <p className="body-s muted">Payments are funded by {branch.name} treasury. Arc settlement details remain available on each transaction.</p>
            </>
          ) : (
            <div className="empty">Global treasury · USDC</div>
          )}
        </aside>

        <section className="tile s8" aria-labelledby="branch-activity">
          <div className="tile-head"><h2 id="branch-activity" className="tile-title">Recent activity</h2><Link href="/activity" className="sx-btn sx-btn--quiet">See all</Link></div>
          {recent.length ? (
            <div className="sx-rows">
              {recent.map((item) => {
                if (item.kind === "payout") {
                  return (
                    <div className="sx-row" key={`p-${item.payout.id}`}>
                      <span className="sx-row__who">{item.payout.recipientName}</span>
                      <span className="sx-row__amount">−{usd(item.payout.usdcAmountMinor)}</span>
                      <span className="sx-row__meta"><span className="sx-rail">{item.payout.rail}</span> {item.payout.reference ?? "Branch payment"}</span>
                      <span className="sx-row__status"><span className="sx-pill">{item.payout.status}</span></span>
                    </div>
                  )
                }
                const transfer = item.transfer
                const incoming = transfer.destinationCompanyId === branch.id
                return (
                  <div className="sx-row" key={`t-${transfer.id}`}>
                    <span className="sx-row__who">{incoming ? `From ${transfer.sourceName}` : `To ${transfer.destinationName}`}</span>
                    <span className="sx-row__amount" style={incoming ? { color: "var(--accent)" } : undefined}>{incoming ? "+" : "−"}{usd(transfer.usdcAmountMinor)}</span>
                    <span className="sx-row__meta"><span className="sx-rail">Internal</span> {transfer.sourceCurrency} → USDC → {transfer.destinationCurrency}</span>
                    <span className="sx-row__status"><span className={`sx-pill ${transfer.status === "COMPLETED" ? "sx-pill--settled" : transfer.status === "FAILED" ? "sx-pill--failed" : "sx-pill--pending"}`}>{statusLabel(transfer.status)}</span></span>
                  </div>
                )
              })}
            </div>
          ) : <div className="empty">No activity for this account yet.</div>}
        </section>

        <aside className="tile s4" aria-labelledby="branch-team">
          <div className="tile-head"><h2 id="branch-team" className="tile-title">Team</h2><Link href="/team" className="sx-btn sx-btn--quiet">Manage</Link></div>
          {data.members.length ? data.members.slice(0, 5).map((member) => (
            <div className="kv" key={member.id}>
              <span>{member.invited_email ?? member.user_id?.slice(0, 8) ?? "Pending login"}</span>
              <span className="sx-pill">{member.role}</span>
            </div>
          )) : <div className="empty">No branch-specific team members yet.</div>}
        </aside>
      </div>

      {moveOpen ? <MoveMoney data={data} onClose={() => setMoveOpen(false)} onChanged={load} /> : null}
    </div>
  )
}

function MoveMoney({ data, onClose, onChanged }: { data: BranchResponse; onClose: () => void; onChanged: () => Promise<void> }) {
  // "Fund this branch" pulls from another account, so it only lists accounts this user may send from.
  // A branch admin usually has none (they can't pull from HQ), so they start on "Move out".
  const fundFrom = data.sources.filter((account) => account.canSendFrom !== false)
  const canFund = fundFrom.length > 0
  const [direction, setDirection] = useState<"in" | "out">(canFund ? "in" : "out")
  const options = direction === "in" ? fundFrom : data.sources
  const [otherId, setOtherId] = useState((canFund ? fundFrom : data.sources)[0]?.id ?? "")
  const [amount, setAmount] = useState("100")
  const [memo, setMemo] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; title: string; message: string; transfer?: InternalTransferDto } | null>(null)

  const other = useMemo(() => data.sources.find((account) => account.id === otherId) ?? null, [data.sources, otherId])
  const source = direction === "in" ? other : data.branch
  const destination = direction === "in" ? data.branch : other

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!source || !destination) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/sancus/internal-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ sourceCompanyId: source.id, destinationCompanyId: destination.id, amountUsdc: Number(amount), memo }),
      })
      const body = await res.json()
      if (!res.ok && !body.transfer) throw new Error(body.error ?? "Could not move the money")
      const transfer = body.transfer as InternalTransferDto
      setResult({
        ok: transfer.status !== "FAILED",
        title: transfer.status === "PENDING_APPROVAL" ? "Sent for approval" : transfer.status === "COMPLETED" ? "Money moved" : "Transfer needs attention",
        message: transfer.status === "PENDING_APPROVAL" ? transfer.approvalReason ?? "An approver must review this transfer." : transfer.failureReason ?? `${source.name} and ${destination.name} activity has been updated.`,
        transfer,
      })
      await onChanged()
    } catch (cause) {
      setResult({ ok: false, title: "Transfer not created", message: cause instanceof Error ? cause.message : "Could not move the money" })
    } finally {
      setBusy(false)
    }
  }

  const path = source && destination
    ? `${source.isRoot ? "USDC" : `m${source.currency} burn → USDC`} → Arc transfer → ${destination.isRoot ? "parent USDC" : `m${destination.currency} mint`}`
    : "Choose another account"

  return (
    <div role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(8, 20, 18, .48)", display: "grid", placeItems: "center", padding: 24 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="move-title" className="tile" style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflow: "auto" }}>
        <div className="tile-head">
          <div><span className="sx-label">Internal transfer</span><h2 id="move-title" className="sx-h heading-3" style={{ margin: "6px 0 0" }}>Move money</h2></div>
          <button type="button" className="sx-btn sx-btn--quiet" onClick={onClose}>×</button>
        </div>

        {result ? (
          <div className={`banner${result.ok ? "" : " banner--err"}`}>
            <div style={{ display: "grid", gap: 6 }}><b>{result.title}</b><span>{result.message}</span></div>
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
            <div className="filters s12" role="group" aria-label="Transfer direction">
              {canFund ? (
                <button type="button" className="chip" aria-pressed={direction === "in"} onClick={() => { setDirection("in"); setOtherId(fundFrom[0]?.id ?? "") }}>Fund this branch</button>
              ) : null}
              <button type="button" className="chip" aria-pressed={direction === "out"} onClick={() => { setDirection("out"); setOtherId(data.sources[0]?.id ?? "") }}>Move out</button>
            </div>
            <label className="sx-field s12">
              <span className="sx-label">{direction === "in" ? "Paying from" : "Destination"}</span>
              <select className="sx-field__input" value={otherId} onChange={(event) => setOtherId(event.target.value)} required>
                {options.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.canSee === false ? "" : ` · ${usd(account.availableMinor)}`}
                    {account.bank ? ` · ${account.bank.name} •••• ${account.bank.last4}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="rail-tile s12">
              <div className="kv"><span>From</span><b>{source?.name ?? "—"}</b></div>
              <div className="kv"><span>To</span><b>{destination?.name ?? "—"}</b></div>
              <div className="kv"><span>Settlement</span><span className="data">{path}</span></div>
              {source?.bank ? <div className="kv"><span>Paying from</span><span>{source.bank.name} · {source.bank.label} •••• {source.bank.last4}</span></div> : null}
            </div>
            <label className="sx-field s6"><span className="sx-label">Amount · USDC</span><input className="sx-field__input" type="number" min="0.01" max="200000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
            <label className="sx-field s6"><span className="sx-label">Memo · optional</span><input className="sx-field__input" maxLength={140} value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Thailand operating funds" /></label>
            <div className="s12 body-s muted">Fixed demo rates are stored with the transfer. Transfers at or above the source account’s approval rule wait in Activity → Approvals before anything moves.</div>
            <div className="s12 tile-foot"><button type="button" className="sx-btn sx-btn--quiet" onClick={onClose}>Cancel</button><button type="submit" className="sx-btn sx-btn--primary" disabled={busy || !source || !destination}>{busy ? "Moving…" : "Review and move"}</button></div>
          </form>
        )}
      </section>
    </div>
  )
}
