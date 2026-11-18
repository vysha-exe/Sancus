"use client"

// Home › Gateway: move USDC from the Treasury wallet into the Circle Gateway unified
// balance (one USDC balance usable across chains; also where x402 earnings land).
import { useCallback, useEffect, useState } from "react"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { useTreasuryWallet } from "@/lib/sancus/use-treasury-wallet"

async function gatewayMinor(): Promise<string | null> {
  try {
    const res = await fetch("/api/sancus/treasury", { cache: "no-store" })
    if (!res.ok) return null
    const body = await res.json()
    return (body.gatewayMinor as string | null) ?? null
  } catch {
    return null
  }
}

export function GatewayCard() {
  const { wallet, balances, state, refresh } = useTreasuryWallet()
  const [gateway, setGateway] = useState<string | null>(null)
  const [amount, setAmount] = useState("5")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [watchUntil, setWatchUntil] = useState(0)

  const loadGateway = useCallback(() => gatewayMinor().then((g) => g !== null && setGateway(g)), [])

  useEffect(() => {
    let cancelled = false
    gatewayMinor().then((g) => !cancelled && g !== null && setGateway(g))
    return () => {
      cancelled = true
    }
  }, [])

  // After a deposit, poll until Gateway shows it (deposits finalize in about a minute).
  useEffect(() => {
    if (!watchUntil) return
    const t = setInterval(() => {
      if (Date.now() > watchUntil) return setWatchUntil(0)
      loadGateway()
    }, 5000)
    return () => clearInterval(t)
  }, [watchUntil, loadGateway])

  const valid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  // Arc uses USDC for gas, so keep a little in the wallet.
  const max = balances.usdc === null ? null : Math.max(0, balances.usdc - 0.5)
  const tooMuch = valid && max !== null && Number(amount) > max

  async function deposit() {
    if (!wallet || !valid) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const res = await fetch("/api/gateway/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet.address, blockchain: "ARC-TESTNET", amount }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.userMessage ?? body.error ?? "The deposit didn't go through")
      } else {
        setNote(`Sent ${amount} USDC to Gateway. It appears in your Gateway balance once it confirms (about a minute).`)
        refresh()
        setWatchUntil(Date.now() + 3 * 60_000)
      }
    } catch {
      setError("Couldn't reach the server")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="tile s6" aria-labelledby="gateway">
      <div className="tile-head">
        <h2 className="tile-title" id="gateway">
          Gateway balance
        </h2>
        <span className="body-s muted">One USDC balance across chains</span>
      </div>

      {state === "signed-out" ? (
        <div className="empty">Sign in to manage your Gateway balance.</div>
      ) : state === "none" ? (
        <div className="empty">Your Treasury wallet is still being set up. Refresh in a moment.</div>
      ) : (
        <>
          <div className="kv">
            <span>In your Treasury wallet</span>
            <span>{balances.usdc === null ? "–" : `$${balances.usdc.toFixed(2)}`}</span>
          </div>
          <div className="kv">
            <span>In Gateway</span>
            <span>
              {gateway === null ? "–" : `$${displayMinor(BigInt(gateway), USDC_DECIMALS, "", 2)}`}
              {watchUntil ? <span className="body-s muted"> · checking…</span> : null}
            </span>
          </div>
          <label className="sx-field">
            <span className="sx-label">Move to Gateway (USDC)</span>
            <input className="sx-field__input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="sx-field__help">
              {tooMuch ? `Keep about $0.50 for network fees. You can move up to $${max?.toFixed(2)}.` : "Payouts, cross-chain transfers and agent earnings use this balance."}
            </span>
          </label>
          <div className="tile-foot">
            <span className="body-s muted">Circle Gateway on Arc</span>
            <button type="button" className="sx-btn sx-btn--primary" onClick={deposit} disabled={!wallet || !valid || tooMuch || busy}>
              {busy ? "Moving…" : "Move to Gateway"}
            </button>
          </div>
          {note ? (
            <span className="body-s" role="status">
              {note}
            </span>
          ) : null}
          {error ? (
            <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          ) : null}
        </>
      )}
    </section>
  )
}
