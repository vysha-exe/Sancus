"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CARD_ROUTE_USD, type DestinationKind } from "@/lib/sancus/process-pipeline"
import { useProcessLog, type ProcessLogEntry } from "@/lib/sancus/use-process-log"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"

const DEST_LABEL: Record<DestinationKind, string> = {
  bank: "Bank via local rail",
  card: "Virtual card",
  collection: "Inbound collection",
  internal: "Branch transfer",
}

function StatusPill({ status }: { status: ProcessLogEntry["status"] }) {
  const cls =
    status === "Settled" ? "sx-pill sx-pill--settled" : status === "Failed" ? "sx-pill sx-pill--failed" : status === "Held" ? "sx-pill sx-pill--held" : "sx-pill sx-pill--pending"
  return <span className={cls}>{status}</span>
}

function StepDot({ status }: { status: string }) {
  return <span className={`proc-step__dot proc-step__dot--${status}`} aria-hidden />
}

type FaceStatus = {
  enabled: boolean
  token: string | null
  explorer: string | null
  balances?: { address: string; name: string; balanceLabel: string | null }[]
}

export function ProcessDashboard() {
  const { entries, loading, source } = useProcessLog()
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | DestinationKind>("all")
  const [face, setFace] = useState<FaceStatus | null>(null)
  const [faucetBusy, setFaucetBusy] = useState(false)
  const [faucetMsg, setFaucetMsg] = useState<string | null>(null)

  const refreshFace = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/face-usdc", { cache: "no-store" })
      if (res.ok) setFace((await res.json()) as FaceStatus)
    } catch {
      /* optional */
    }
  }, [])

  useEffect(() => {
    void refreshFace()
  }, [refreshFace])

  async function mintFaceUsdc() {
    setFaucetBusy(true)
    setFaucetMsg(null)
    try {
      const res = await fetch("/api/sancus/face-usdc", { method: "POST" })
      const body = (await res.json()) as { error?: string; minted?: { amountLabel: string; explorer: string }[] }
      if (!res.ok) {
        setFaucetMsg(body.error || "Mint failed")
        return
      }
      const n = body.minted?.length ?? 0
      setFaucetMsg(`Minted ${body.minted?.[0]?.amountLabel ?? "$1,000,000"} fUSDC to ${n} wallet${n === 1 ? "" : "s"}.`)
      signalSancusDataChanged()
      await refreshFace()
    } catch (e) {
      setFaucetMsg(e instanceof Error ? e.message : "Mint failed")
    } finally {
      setFaucetBusy(false)
    }
  }

  const visible = useMemo(() => {
    if (filter === "all") return entries
    return entries.filter((e) => e.destinationKind === filter)
  }, [entries, filter])

  // Auto-open first row once data arrives.
  const activeId = openId ?? visible[0]?.id ?? null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Process</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Activity log for every settlement: USD → Face USDC (fUSDC) → local currency → bank rail (large) or virtual
            card (under ${CARD_ROUTE_USD}). Open a row for on-ramp, off-ramp, and local rail steps, plus Arc testnet
            links when a hash exists.
          </p>
        </div>
        <span className="sx-pill">{source === "live" ? "Live activity" : "Demo corridors"}</span>
      </header>

      <div className="grid">
        <section className="tile s12" aria-label="Face USDC faucet">
          <div className="tile-head">
            <h2 className="tile-title">Face USDC (test)</h2>
            {face?.explorer ? (
              <a className="sx-btn sx-btn--quiet" href={face.explorer} target="_blank" rel="noreferrer">
                Token on Arc
              </a>
            ) : null}
          </div>
          <p className="body-s muted" style={{ margin: 0 }}>
            Settlements use mintable <b>fUSDC</b> from the rail bot instead of scarce Circle testnet USDC — mint a large
            balance, then run many Pay / ACH / PayNow flows with real Arc explorer links.
          </p>
          {face?.enabled ? (
            <div className="kv" style={{ flexWrap: "wrap", gap: 8 }}>
              {(face.balances ?? []).slice(0, 4).map((b) => (
                <span key={b.address} className="body-s">
                  {b.name}: <b>{b.balanceLabel ?? "—"}</b>
                </span>
              ))}
            </div>
          ) : (
            <span className="body-s" style={{ color: "var(--held)" }}>
              fUSDC not ready — deploy with <code>node scripts/deploy-mock-stablecoins.mjs</code>.
            </span>
          )}
          <div className="tile-foot">
            <button type="button" className="sx-btn sx-btn--primary" disabled={!face?.enabled || faucetBusy} onClick={() => void mintFaceUsdc()}>
              {faucetBusy ? "Minting…" : "Mint $1,000,000 fUSDC"}
            </button>
            {faucetMsg ? <span className="body-s muted">{faucetMsg}</span> : null}
          </div>
        </section>

        <section className="tile s12 proc-legend" aria-label="Settlement path">
          <div className="proc-flow" role="list">
            <span className="proc-flow__leg" role="listitem">
              USD
            </span>
            <span className="proc-flow__arrow" aria-hidden>
              →
            </span>
            <span className="proc-flow__leg" role="listitem">
              fUSDC on Arc
            </span>
            <span className="proc-flow__arrow" aria-hidden>
              →
            </span>
            <span className="proc-flow__leg" role="listitem">
              Country currency
            </span>
            <span className="proc-flow__arrow" aria-hidden>
              →
            </span>
            <span className="proc-flow__leg proc-flow__leg--split" role="listitem">
              <b>Bank rail</b>
              <small>ACH · Pix · PromptPay · BI-FAST · QRIS…</small>
            </span>
            <span className="proc-flow__or">or</span>
            <span className="proc-flow__leg proc-flow__leg--split" role="listitem">
              <b>Virtual card</b>
              <small>under ${CARD_ROUTE_USD}</small>
            </span>
          </div>
        </section>

        <section className="tile s12">
          <div className="tile-head">
            <h2 className="tile-title">Activity log</h2>
            <div className="proc-filters" role="tablist" aria-label="Filter by destination">
              {(
                [
                  ["all", "All"],
                  ["bank", "Bank rails"],
                  ["card", "Cards"],
                  ["collection", "Inbound"],
                  ["internal", "Internal"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={filter === key ? "sx-btn sx-btn--quiet proc-filter--on" : "sx-btn sx-btn--quiet"}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <span className="body-s muted">Loading transactions…</span>
          ) : visible.length === 0 ? (
            <span className="body-s muted">No transactions in this filter yet. Send a payment from Pay to populate the log.</span>
          ) : (
            <ul className="proc-log">
              {visible.map((e) => {
                const open = e.id === activeId
                return (
                  <li key={e.id} className={open ? "proc-log__item proc-log__item--open" : "proc-log__item"}>
                    <button
                      type="button"
                      className="proc-log__row"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : e.id)}
                    >
                      <span className="proc-log__when">{e.whenLabel}</span>
                      <span className="proc-log__who">
                        <b>{e.who}</b>
                        <span className="muted">{e.corridorLabel}</span>
                      </span>
                      <span className="proc-log__amt" data-in={e.amountIn ? "1" : undefined}>
                        {e.amount}
                      </span>
                      <span className="proc-log__meta">
                        <span className="sx-rail">{e.rail}</span>
                        <StatusPill status={e.status} />
                      </span>
                    </button>

                    {open ? (
                      <div className="proc-log__detail">
                        <div className="proc-log__detail-head">
                          <span className="body-s">
                            Destination: <b>{DEST_LABEL[e.destinationKind]}</b>
                            {e.simulated ? " · simulated legs allowed" : ""}
                          </span>
                          {e.explorerUrl ? (
                            <a className="sx-btn sx-btn--quiet" href={e.explorerUrl} target="_blank" rel="noreferrer">
                              Arc testnet tx
                            </a>
                          ) : (
                            <span className="body-s muted">No on-chain hash yet</span>
                          )}
                        </div>
                        <ol className="proc-steps">
                          {e.steps.map((s) => (
                            <li key={s.id} className={`proc-step proc-step--${s.status}`}>
                              <StepDot status={s.status} />
                              <div>
                                <div className="proc-step__title">{s.title}</div>
                                <p className="body-s muted" style={{ margin: "4px 0 0" }}>
                                  {s.detail}
                                </p>
                                {s.explorerUrl ? (
                                  <a className="proc-step__link" href={s.explorerUrl} target="_blank" rel="noreferrer">
                                    View on Arc testnet explorer
                                  </a>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
