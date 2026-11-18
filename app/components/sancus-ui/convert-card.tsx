"use client"

// Home › Convert: swap USDC ⇄ EURC in the Treasury (Circle App Kit swap on Arc testnet).
import { useState } from "react"
import { useTreasuryWallet } from "@/lib/sancus/use-treasury-wallet"
import { FIXED_USDC_EURC_RATE } from "@/lib/sancus/fixed-rates"

type Dir = "USDC_EURC" | "EURC_USDC"
type Quote = { amountOut: string; effectiveRate: string }

const fmt = (n: number | null, sym: string) => (n === null ? "–" : `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

export function ConvertCard() {
  const { wallet, balances, state, refresh } = useTreasuryWallet()
  const [dir, setDir] = useState<Dir>("USDC_EURC")
  const [amount, setAmount] = useState("1")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ out: string; tx: string | null } | null>(null)

  const tokenIn = dir === "USDC_EURC" ? "USDC" : "EURC"
  const tokenOut = dir === "USDC_EURC" ? "EURC" : "USDC"
  const have = tokenIn === "USDC" ? balances.usdc : balances.eurc
  const valid = /^\d*\.?\d+$/.test(amount) && Number(amount) > 0
  const tooMuch = valid && have !== null && Number(amount) > have

  const fixedRate = dir === "USDC_EURC" ? FIXED_USDC_EURC_RATE : 1 / FIXED_USDC_EURC_RATE
  const quote: Quote | null = valid
    ? { amountOut: String(Number(amount) * fixedRate), effectiveRate: String(fixedRate) }
    : null

  async function convert() {
    if (!wallet || !valid) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      const res = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: wallet.walletId, tokenIn, tokenOut, amountIn: amount }),
      })
      const body = await res.json()
      if (!res.ok || body.success === false) {
        setError(body.userMessage ?? body.error ?? body.statusMessage ?? "The conversion didn't go through")
      } else {
        setDone({ out: body.amountOut, tx: body.txHash ?? null })
        refresh()
      }
    } catch {
      setError("Couldn't reach the server")
    } finally {
      setBusy(false)
    }
  }

  const shownQuote = valid ? quote : null

  return (
    <section className="tile s6" aria-labelledby="convert">
      <div className="tile-head">
        <h2 className="tile-title" id="convert">
          Convert
        </h2>
        <span className="body-s muted">
          {fmt(balances.usdc, "$")} USDC · {fmt(balances.eurc, "€")} EURC
        </span>
      </div>

      {state === "none" ? (
        <div className="empty">Your Treasury wallet is still being set up. Refresh in a moment.</div>
      ) : state === "signed-out" ? (
        <div className="empty">Sign in to convert between USDC and EURC.</div>
      ) : (
        <>
          <div className="filters" role="group" aria-label="Direction">
            <button type="button" className="chip" aria-pressed={dir === "USDC_EURC"} onClick={() => setDir("USDC_EURC")}>
              USDC → EURC
            </button>
            <button type="button" className="chip" aria-pressed={dir === "EURC_USDC"} onClick={() => setDir("EURC_USDC")}>
              EURC → USDC
            </button>
          </div>
          <label className="sx-field">
            <span className="sx-label">You convert ({tokenIn})</span>
            <input
              className="sx-field__input"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setDone(null)
              }}
            />
            <span className="sx-field__help">
              {tooMuch
                ? `You have ${fmt(have, tokenIn === "USDC" ? "$" : "€")} ${tokenIn}`
                : shownQuote
                    ? `You get about ${Number(shownQuote.amountOut).toFixed(4)} ${tokenOut} · 1 ${tokenIn} = ${Number(shownQuote.effectiveRate).toFixed(4)} ${tokenOut}`
                    : "Enter an amount to use the fixed demo rate"}
            </span>
          </label>
          <div className="tile-foot">
            <span className="body-s muted">Fixed demo rate · Circle stablecoin swap on Arc</span>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              onClick={convert}
              disabled={!wallet || !valid || tooMuch || busy || !shownQuote}
            >
              {busy ? "Converting…" : `Convert to ${tokenOut}`}
            </button>
          </div>
          {done ? (
            <span className="body-s" role="status">
              Done: got {Number(done.out).toFixed(4)} {tokenOut}.{" "}
              {done.tx ? (
                <a href={`https://explorer.testnet.arc.io/tx/${done.tx}`} target="_blank" rel="noreferrer">
                  View on Arc explorer
                </a>
              ) : null}
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
