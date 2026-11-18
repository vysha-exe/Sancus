"use client"

// Settings › How your money is kept: one-click Arc treasury setup + faucet steps.
import { useCallback, useEffect, useState } from "react"

type WalletView = { name: string; address: string; walletId: string; explorer: string } | null
type Status = {
  circleConfigured?: boolean
  treasury: WalletView
  settlement: WalletView
  faucet: string
  created?: string[]
  notes?: string[]
}

export function TreasurySetup({ onChange }: { onChange?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/treasury/setup", { cache: "no-store" })
      if (res.ok) setStatus((await res.json()) as Status)
    } catch {
      /* offline / signed out: show nothing */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/sancus/treasury/setup", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => !cancelled && s && setStatus(s as Status))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function setup() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sancus/treasury/setup", { method: "POST" })
      const body = await res.json()
      if (!res.ok) {
        setError(body.fix ? `${body.error}. ${body.fix}` : body.reason ? `${body.error}: ${body.reason}` : body.error)
      } else {
        setStatus((prev) => ({ ...(prev ?? body), ...body, circleConfigured: true }))
        onChange?.()
        await load()
      }
    } catch {
      setError("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  if (!status) return null

  const ready = Boolean(status.treasury && status.settlement)

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: 14,
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-000)",
      }}
    >
      {!status.circleConfigured ? (
        <span className="body-s">
          <b>Connect Circle first.</b> Add your testnet <code>CIRCLE_API_KEY</code> to <code>app/.env.local</code>, run{" "}
          <code>node scripts/circle-entity-secret.mjs</code>, restart the app, then come back here.
        </span>
      ) : !ready ? (
        <>
          <span className="body-s">
            <b>Create your treasury on Arc testnet.</b> Sancus makes two Circle wallets: a <b>Treasury</b> that holds your
            USDC (and receives what agents pay you), and a <b>Settlement</b> wallet that stands in for the payout partner.
          </span>
          <div>
            <button type="button" className="sx-btn sx-btn--primary" onClick={setup} disabled={busy}>
              {busy ? "Creating wallets…" : "Set up treasury"}
            </button>
          </div>
        </>
      ) : (
        <>
          {[status.treasury!, status.settlement!].map((w) => (
            <div className="kv" key={w.walletId}>
              <span>
                <b>{w.name}</b>
              </span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <a href={w.explorer} target="_blank" rel="noreferrer" className="data">
                  {w.address.slice(0, 8)}…{w.address.slice(-6)}
                </a>
                <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => copy(w.address)}>
                  {copied === w.address ? "Copied" : "Copy"}
                </button>
              </span>
            </div>
          ))}
          <span className="body-s">
            <b>Fund it:</b> copy the Treasury address, open the faucet, pick <b>Arc Testnet</b> and <b>USDC</b>, and paste it.
            The balance shows up here and on Home within a minute.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a href={status.faucet} target="_blank" rel="noreferrer" className="sx-btn sx-btn--primary">
              Get test USDC
            </a>
            <button type="button" className="sx-btn sx-btn--secondary" onClick={() => copy(status.treasury!.address)}>
              {copied === status.treasury!.address ? "Copied" : "Copy Treasury address"}
            </button>
          </div>
        </>
      )}
      {status.notes && status.notes.length > 0 ? (
        <span className="body-s muted">{status.notes.join(" · ")}</span>
      ) : null}
      {error ? (
        <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
