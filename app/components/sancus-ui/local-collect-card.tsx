"use client"

// Receive › Local rails: charge a customer by QRIS (Indonesia), PromptPay (Thailand) or Pix
// (Brazil) in sandbox. When the rail reports paid, funds settle into the branch's
// local operating bank account; Arc wallets remain a separate liquidity surface.
import { useCallback, useEffect, useState } from "react"

type Rail = "QRIS" | "PROMPTPAY" | "PIX"
type RailInfo = {
  rail: Rail
  currency: string
  label: string
  minMinor: string
  maxMinor: string
  configured: boolean
  token: { symbol: string; address: string; explorer: string }
}
type Collection = {
  id: string
  rail: Rail
  railLabel: string
  currency: string
  amountMinor: string
  provider: string
  status: "PENDING" | "PAID" | "CREDITING" | "CREDITED" | "MINTING" | "MINTED" | "FAILED" | "EXPIRED"
  simulated: boolean
  qrImageUrl: string | null
  qrPayload: string | null
  simulatorUrl: string | null
  destination: { address: string; label: string | null }
  token: { symbol: string; address: string; explorer: string }
  mintTx: string | null
  mintExplorer: string | null
  error: string | null
  createdAt: string
}

const DEFAULT_AMOUNT: Record<Rail, string> = { QRIS: "150000", PROMPTPAY: "500", PIX: "250" }
const FLAG: Record<Rail, string> = { QRIS: "🇮🇩", PROMPTPAY: "🇹🇭", PIX: "🇧🇷" }
const STATUS_LABEL: Record<Collection["status"], string> = {
  PENDING: "Waiting for payment",
  PAID: "Paid · depositing",
  CREDITING: "Depositing to bank",
  CREDITED: "Received in bank",
  MINTING: "Legacy Arc settlement",
  MINTED: "Legacy receipt",
  FAILED: "Failed",
  EXPIRED: "Expired",
}
const live = (s: Collection["status"]) => s === "PENDING" || s === "PAID" || s === "CREDITING" || s === "MINTING"
const money = (minor: string, cur: string) =>
  `${(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`

export function LocalCollectCard() {
  const [rails, setRails] = useState<RailInfo[]>([])
  const [items, setItems] = useState<Collection[]>([])
  const [railBot, setRailBot] = useState(true)
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading")
  const [rail, setRail] = useState<Rail>("QRIS")
  const [amount, setAmount] = useState(DEFAULT_AMOUNT.QRIS)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/rails/collections", { cache: "no-store" })
      if (res.status === 401) return setState("signed-out")
      const body = await res.json()
      if (!res.ok) throw new Error(body.error)
      setRails(body.rails)
      setItems(body.collections)
      setRailBot(body.railBot)
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  // Keep polling while anything is still moving.
  const moving = items.some((c) => live(c.status))
  useEffect(() => {
    if (!moving) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [moving, load])

  const info = rails.find((r) => r.rail === rail)
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0
  const minor = valid ? String(Math.round(Number(amount) * 100)) : "0"
  const outOfRange = info && valid && (BigInt(minor) < BigInt(info.minMinor) || BigInt(minor) > BigInt(info.maxMinor))

  async function charge() {
    setBusy("create")
    setError(null)
    try {
      const res = await fetch("/api/sancus/rails/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail, amountMinor: minor }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't create the charge")
      setItems((prev) => [body.collection, ...prev])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function markPaid(c: Collection) {
    setBusy(c.id)
    setError(null)
    try {
      const res = await fetch(`/api/sancus/rails/collections/${c.id}/paid`, { method: "POST" })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't mark it paid")
      setItems((prev) => prev.map((x) => (x.id === c.id ? body.collection : x)))
      load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const latest = items[0]

  return (
    <section className="tile s12" aria-labelledby="local-rails">
      <div className="tile-head">
        <h2 className="tile-title" id="local-rails">
          Collect in local currency
        </h2>
      </div>
      <p className="body-s muted" style={{ margin: 0 }}>
        Your customer pays by their local QR rail. When it settles, the branch&apos;s local operating bank account is credited.
      </p>

      {state === "signed-out" ? (
        <div className="empty">Sign in to collect through local rails.</div>
      ) : state === "error" ? (
        <div className="empty">Couldn&apos;t load local rails. Refresh to try again.</div>
      ) : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="s5" style={{ display: "grid", gap: 12, alignContent: "start" }}>
            <div className="filters" role="group" aria-label="Rail">
              {(["QRIS", "PROMPTPAY", "PIX"] as Rail[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  aria-pressed={rail === r}
                  onClick={() => {
                    setRail(r)
                    setAmount(DEFAULT_AMOUNT[r])
                  }}
                >
                  {FLAG[r]} {r === "PROMPTPAY" ? "PromptPay" : r === "PIX" ? "Pix" : "QRIS"}
                </button>
              ))}
            </div>
            <label className="sx-field">
              <span className="sx-label">Amount ({info?.currency ?? "…"})</span>
              <input className="sx-field__input sx-field__amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="sx-field__help">
                {outOfRange && info
                  ? `Between ${money(info.minMinor, info.currency)} and ${money(info.maxMinor, info.currency)}`
                  : info
                    ? `Deposits to the branch bank · ${info.label}`
                    : "Loading rails…"}
              </span>
            </label>
            <div className="tile-foot">
              <span className="body-s muted">{railBot ? "Rail bot ready" : "Rail bot not set up"}</span>
              <button
                type="button"
                className="sx-btn sx-btn--primary"
                onClick={charge}
                disabled={state !== "ready" || !valid || Boolean(outOfRange) || busy !== null || !railBot || (info && !info.configured)}
              >
                {busy === "create" ? "Creating…" : "Create QR"}
              </button>
            </div>
            {error ? (
              <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
                {error}
              </span>
            ) : null}
          </div>

          <div className="s7" style={{ display: "grid", gap: 12, alignContent: "start" }}>
            {latest ? (
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "start" }}>
                <div
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 12,
                    border: "1px solid var(--border, #ddd)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  {latest.qrImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={latest.qrImageUrl} alt={`${latest.railLabel} QR code`} width={140} height={140} />
                  ) : (
                    <span className="body-s muted" style={{ padding: 8, textAlign: "center" }}>
                      {latest.simulated ? "Pix · settles in seconds" : "QR loading…"}
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <span className="body-strong">
                    {FLAG[latest.rail]} {money(latest.amountMinor, latest.currency)}
                  </span>
                  <span className="body-s" role="status">
                    {STATUS_LABEL[latest.status]}
                    {latest.status === "CREDITED" ? ` · ${money(latest.amountMinor, latest.currency)} in ${latest.destination.label}` : ""}
                  </span>
                  <span className="body-s muted">
                    Into {latest.destination.label} · account ending {latest.destination.address.slice(-4)}
                  </span>
                  <div className="tile-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                    {latest.status === "PENDING" && latest.provider !== "midtrans" ? (
                      <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => markPaid(latest)} disabled={busy !== null}>
                        {busy === latest.id ? "Paying…" : "Simulate customer payment"}
                      </button>
                    ) : null}
                    {latest.status === "PENDING" && latest.simulatorUrl && latest.provider === "midtrans" ? (
                      <a className="sx-btn sx-btn--secondary sx-btn--sm" href={latest.simulatorUrl} target="_blank" rel="noreferrer">
                        Pay in Midtrans simulator
                      </a>
                    ) : null}
                    {latest.mintExplorer ? (
                      <a className="sx-btn sx-btn--quiet sx-btn--sm" href={latest.mintExplorer} target="_blank" rel="noreferrer">
                        Mint tx on Arc
                      </a>
                    ) : null}
                  </div>
                  {latest.provider === "midtrans" && latest.status === "PENDING" && latest.qrImageUrl ? (
                    <span className="body-s muted">In the simulator, paste the QR image URL to pay.</span>
                  ) : null}
                  {latest.error ? <span className="body-s muted">Note: {latest.error}</span> : null}
                </div>
              </div>
            ) : (
              <div className="empty">No local collections yet. Create a QR to start.</div>
            )}

            {items.length > 1 ? (
              <div className="sx-rows">
                {items.slice(1, 6).map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span className="body-s">
                      {FLAG[c.rail]} {money(c.amountMinor, c.currency)} · {c.destination.label}
                    </span>
                    <span className="body-s muted">
                      {c.mintExplorer ? (
                        <a href={c.mintExplorer} target="_blank" rel="noreferrer">
                          {STATUS_LABEL[c.status]}
                        </a>
                      ) : (
                        STATUS_LABEL[c.status]
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
