"use client"

import { useCallback, useEffect, useState } from "react"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"

type RootTreasury = {
  company: { id: string; name: string }
  wallet: { id: string; address: string; name: string; blockchain: string } | null
  gatewaySigner: { id: string; address: string; blockchain: string } | null
  assets: {
    usdcMinor: string
    gatewayUsdcMinor: string
    fUsdcMinor: string
    fUsdcAddress?: string | null
    gatewayAddress?: string
    readiness?: { canonicalUsdc: boolean; internalLiquidity: boolean }
  }
  earnings: {
    totalMinor: string
    calls: number
    recent: { id: string; endpoint: string; payer: string; amountMinor: string; gatewayTx?: string | null; createdAt: string }[]
  }
  warnings: string[]
  activity: { id: string; kind: string; label: string; amount: string; currency: string; status: string; txHash?: string | null; createdAt: string }[]
}

type EquityData = {
  broker: string
  portfolio: { symbol: "NVDA" | "GOOGL"; name: string; address: string; shares: string; priceMinor: string; valueMinor: string }[]
  activity: { id: string; symbol: string; action: string; status: string; usdc_amount_minor: string }[]
}

type YieldData = {
  vaults: { vaultAddress: string; name: string; protocol: string; currentApy: number | string; status: string }[]
  positions: { vaultAddress: string; currentBalance: string; hasPosition: boolean }[]
  activity: { id: string; action: string; amount: string; status: string; vault_address: string }[]
}

const usd = (minor: string) => `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)}`
const short = (value: string) => value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value

export default function TreasuryPage() {
  const [data, setData] = useState<RootTreasury | null>(null)
  const [equities, setEquities] = useState<EquityData | null>(null)
  const [yieldData, setYieldData] = useState<YieldData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [tradeAmount, setTradeAmount] = useState("25")
  const [sellAmount, setSellAmount] = useState("0.1")
  const [yieldAmount, setYieldAmount] = useState("5")
  const [gatewayAmount, setGatewayAmount] = useState("3")

  const load = useCallback(async () => {
    const response = await fetch("/api/sancus/treasury/root", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Could not load the parent treasury")
    setData(body)
    return body as RootTreasury
  }, [])

  const loadEquities = useCallback(async () => {
    const response = await fetch("/api/sancus/treasury/equities", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "Could not load treasury assets")
    setEquities(body)
  }, [])

  const loadYield = useCallback(async () => {
    const response = await fetch("/api/sancus/treasury/yield", { cache: "no-store" })
    const body = await response.json()
    if (!response.ok) throw new Error(body.userMessage || body.error || "Could not load yield vaults")
    setYieldData(body)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const root = await load()
      if (!root.wallet) {
        setEquities(null)
        setYieldData(null)
        return
      }
      const results = await Promise.allSettled([loadEquities(), loadYield()])
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
      if (failure) throw failure.reason
    } finally {
      setLoading(false)
    }
  }, [load, loadEquities, loadYield])

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      refresh().catch((cause) => {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load treasury")
      })
    }, 0)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [refresh])

  async function post(path: string, body: object, action: string) {
    setBusy(action)
    setError(null)
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.userMessage || result.error || "Treasury action failed")
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Treasury action failed")
    } finally {
      setBusy(null)
    }
  }

  async function setupParentTreasury() {
    setBusy("setup")
    setError(null)
    try {
      const response = await fetch("/api/sancus/treasury/root", { method: "POST" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not set up the parent treasury")
      await refresh()
      if (result.notes?.length) setError(result.notes.join(" "))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set up the parent treasury")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <span className="sx-label">Parent company capital</span>
          <h1 className="sx-h heading-1">Treasury</h1>
          <p className="body-s muted">Canonical USDC, agent revenue, internal liquidity, investments, and yield for {data?.company.name ?? "the parent company"}. Branch funds stay separate.</p>
        </div>
        <button type="button" className="sx-btn sx-btn--secondary" onClick={() => refresh().catch((cause) => setError(String(cause)))}>Refresh</button>
      </header>

      {error ? <div className="empty" role="alert">{error}</div> : null}
      <div className="grid">
        <section className="tile s4"><span className="sx-label">Spendable on Arc</span><span className="amount-xl">{data ? usd(data.assets.usdcMinor) : loading ? "…" : "—"}</span><span className="body-s muted">Canonical USDC · yield and Gateway compatible</span></section>
        <section className="tile s4">
          <span className="sx-label">Agent revenue</span><span className="amount-xl">{data ? usd(data.assets.gatewayUsdcMinor) : loading ? "…" : "—"}</span><span className="body-s muted">Gateway USDC available to move into the Arc treasury</span>
          <div className="form-row"><input className="sx-input" aria-label="Gateway USDC amount" value={gatewayAmount} disabled={!data?.wallet} onChange={(event) => setGatewayAmount(event.target.value)} /><button className="sx-btn sx-btn--secondary" type="button" disabled={busy !== null || !data?.wallet || Number(gatewayAmount) <= 2.01} onClick={() => void post("/api/sancus/treasury/gateway", { amount: gatewayAmount }, "gateway")}>{busy === "gateway" ? "Moving…" : "Move to treasury"}</button></div>
          <small className="muted">Moves above 2.01 USDC cover the Gateway test fee.</small>
        </section>
        <section className="tile s4"><span className="sx-label">Internal liquidity</span><span className="amount-xl">{data ? usd(data.assets.fUsdcMinor) : loading ? "…" : "—"}</span><span className="body-s muted">fUSDC · internal settlement and stock allocation only</span></section>

        <section className="tile s8" aria-labelledby="agent-revenue">
          <div className="tile-head"><div><h2 className="tile-title" id="agent-revenue">Agent revenue</h2><p className="body-s muted">Paid route-quote calls attributed directly to this parent company.</p></div><span className="sx-pill sx-pill--settled">{data?.earnings.calls ?? 0} paid</span></div>
          {data?.earnings.recent.length ? data.earnings.recent.map((earning) => <div className="kv" key={earning.id}><span><strong>{earning.endpoint}</strong><br /><small className="muted">{short(earning.payer)} · {new Date(earning.createdAt).toLocaleString()}</small></span><span className="data">+{usd(earning.amountMinor)}</span></div>) : <div className="empty">No parent-company x402 revenue yet.</div>}
          <div className="tile-foot"><span className="body-s muted">Recorded total · {data ? usd(data.earnings.totalMinor) : loading ? "…" : "—"}</span><a className="sx-btn sx-btn--quiet" href="/api/x402" target="_blank" rel="noreferrer">View paid API</a></div>
        </section>

        <section className="tile s4" aria-labelledby="wallet">
          <h2 className="tile-title" id="wallet">Parent wallet</h2>
          {data?.wallet ? <><div className="kv"><span>Network</span><span>{data.wallet.blockchain}</span></div><div className="kv"><span>Address</span><span className="data">{short(data.wallet.address)}</span></div><a className="sx-btn sx-btn--secondary" target="_blank" rel="noreferrer" href={`https://explorer.testnet.arc.io/address/${data.wallet.address}`}>View on Arc</a></> : null}
          {data?.gatewaySigner ? <div className="kv"><span>Gateway signer</span><span className="data">{short(data.gatewaySigner.address)}</span></div> : <div className="empty"><p>{data?.wallet ? "Add the company-owned Gateway signer for paid agent requests." : "Create an Arc wallet and Gateway signer owned by the parent company."}</p><button className="sx-btn sx-btn--secondary" type="button" disabled={!data || busy !== null} onClick={() => void setupParentTreasury()}>{busy === "setup" ? "Setting up…" : data?.wallet ? "Complete Gateway setup" : "Set up parent treasury"}</button></div>}
          <div className="kv"><span>Canonical USDC floor</span><span className={`sx-pill ${data?.assets.readiness?.canonicalUsdc ? "sx-pill--settled" : "sx-pill--warning"}`}>{data?.assets.readiness?.canonicalUsdc ? "READY" : "NEEDS FUNDS"}</span></div>
          <div className="kv"><span>Internal liquidity floor</span><span className={`sx-pill ${data?.assets.readiness?.internalLiquidity ? "sx-pill--settled" : "sx-pill--warning"}`}>{data?.assets.readiness?.internalLiquidity ? "READY" : "LOW"}</span></div>
          <button className="sx-btn sx-btn--quiet" type="button" disabled={busy !== null || !data?.wallet} onClick={() => void post("/api/sancus/treasury/readiness", {}, "readiness")}>{busy === "readiness" ? "Checking…" : "Check & fund test liquidity"}</button>
          {data?.warnings.map((warning) => <span className="body-s muted" key={warning}>{warning}</span>)}
        </section>

        <section className="tile s6">
          <div className="tile-head"><div><h2 className="tile-title">Assets</h2><p className="body-s muted">ERC-20 stock allocations use only parent-company fUSDC.</p></div><span className="sx-pill">Arc</span></div>
          {equities?.portfolio.map((asset) => <div className="kv" key={asset.symbol}><span><strong>{asset.symbol}</strong> · {asset.name}<br /><small className="muted">{Number(asset.shares).toLocaleString(undefined, { maximumFractionDigits: 6 })} shares · {usd(asset.priceMinor)} each</small></span><span className="data">{usd(asset.valueMinor)}</span></div>)}
          <label className="sx-label" htmlFor="trade-amount">fUSDC to invest</label><input id="trade-amount" className="sx-input" value={tradeAmount} disabled={!equities} onChange={(event) => setTradeAmount(event.target.value)} />
          <div className="form-row">{(["NVDA", "GOOGL"] as const).map((symbol) => <button className="sx-btn sx-btn--secondary" key={symbol} type="button" disabled={busy !== null || !equities} onClick={() => void post("/api/sancus/treasury/equities", { action: "BUY", symbol, amount: tradeAmount }, `buy-${symbol}`)}>{busy === `buy-${symbol}` ? "Buying…" : `Buy ${symbol}`}</button>)}</div>
          <label className="sx-label" htmlFor="sell-amount">Shares to sell</label><input id="sell-amount" className="sx-input" value={sellAmount} disabled={!equities} onChange={(event) => setSellAmount(event.target.value)} />
          <div className="form-row">{(["NVDA", "GOOGL"] as const).map((symbol) => <button className="sx-btn sx-btn--quiet" key={symbol} type="button" disabled={busy !== null || !equities} onClick={() => void post("/api/sancus/treasury/equities", { action: "SELL", symbol, amount: sellAmount }, `sell-${symbol}`)}>{busy === `sell-${symbol}` ? "Selling…" : `Sell ${symbol}`}</button>)}</div>
        </section>
        <section className="tile s6">
          <div className="tile-head"><div><h2 className="tile-title">Yield</h2><p className="body-s muted">Earn vaults use canonical parent-company USDC only.</p></div><span className="sx-pill">EarnKit</span></div>
          {yieldData?.vaults.length ? yieldData.vaults.slice(0, 3).map((vault) => {
            const position = yieldData.positions.find((item) => item.vaultAddress.toLowerCase() === vault.vaultAddress.toLowerCase())
            return <div className="kv" key={vault.vaultAddress}><span><strong>{vault.name}</strong><br /><small className="muted">{vault.protocol} · {Number(vault.currentApy).toFixed(2)}% APY</small></span><span className="data">${Number(position?.currentBalance ?? 0).toFixed(2)}</span></div>
          }) : <div className="empty">No Arc USDC vaults are available right now.</div>}
          <label className="sx-label" htmlFor="yield-amount">Canonical USDC to deposit</label><input id="yield-amount" className="sx-input" value={yieldAmount} disabled={!yieldData?.vaults[0]} onChange={(event) => setYieldAmount(event.target.value)} />
          <button className="sx-btn sx-btn--secondary" type="button" disabled={busy !== null || !yieldData?.vaults[0]} onClick={() => yieldData?.vaults[0] && void post("/api/sancus/treasury/yield", { action: "DEPOSIT", vaultAddress: yieldData.vaults[0].vaultAddress, amount: yieldAmount }, "yield")}>{busy === "yield" ? "Depositing…" : "Deposit in top vault"}</button>
          <button className="sx-btn sx-btn--quiet" type="button" disabled={busy !== null || !yieldData?.vaults[0]} onClick={() => yieldData?.vaults[0] && void post("/api/sancus/treasury/yield", { action: "WITHDRAW", vaultAddress: yieldData.vaults[0].vaultAddress, amount: yieldAmount }, "withdraw-yield")}>{busy === "withdraw-yield" ? "Withdrawing…" : "Withdraw from top vault"}</button>
        </section>

        <section className="tile s12" aria-labelledby="treasury-activity">
          <div className="tile-head"><div><h2 className="tile-title" id="treasury-activity">Treasury activity</h2><p className="body-s muted">Parent-company revenue, Gateway moves, investments, and yield actions.</p></div></div>
          {data?.activity.length ? data.activity.map((item) => <div className="kv" key={item.id}><span><span className="sx-label">{item.kind}</span><br /><strong>{item.label}</strong><br /><small className="muted">{new Date(item.createdAt).toLocaleString()}</small></span><span><span className="data">{item.currency === "fUSDC" ? `${usd(item.amount)} fUSDC` : usd(item.amount)}</span><br /><span className={`sx-pill ${item.status === "CONFIRMED" ? "sx-pill--settled" : item.status === "FAILED" ? "sx-pill--failed" : "sx-pill--warning"}`}>{item.status}</span></span></div>) : <div className="empty">No parent-company treasury activity yet.</div>}
        </section>
      </div>
    </div>
  )
}
