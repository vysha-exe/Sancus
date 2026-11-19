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
  const [yieldVaultAddress, setYieldVaultAddress] = useState("")
  const [gatewayAmount, setGatewayAmount] = useState("")

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
    setYieldVaultAddress((current) => current && body.vaults.some((vault: YieldData["vaults"][number]) => vault.vaultAddress === current) ? current : body.vaults[0]?.vaultAddress ?? "")
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

  const equityValueMinor = equities?.portfolio.reduce((total, asset) => total + BigInt(asset.valueMinor), 0n) ?? 0n
  const yieldValueMinor = BigInt(Math.round((yieldData?.positions.reduce((total, position) => total + Number(position.currentBalance || 0), 0) ?? 0) * 10 ** USDC_DECIMALS))
  const liquidValueMinor = data ? BigInt(data.assets.usdcMinor) + BigInt(data.assets.gatewayUsdcMinor) + BigInt(data.assets.fUsdcMinor) : 0n
  const totalValueMinor = liquidValueMinor + equityValueMinor + yieldValueMinor
  const selectedYieldVault = yieldData?.vaults.find((vault) => vault.vaultAddress === yieldVaultAddress)
  const gatewayAvailable = data ? Number(data.assets.gatewayUsdcMinor) / 10 ** USDC_DECIMALS : 0
  const gatewayTransferAmount = Number(gatewayAmount)
  const gatewayTransferValid = gatewayTransferAmount > 2.01 && gatewayTransferAmount <= gatewayAvailable

  return (
    <div className="page treasury-page">
      <header className="page-head">
        <div>
          <span className="sx-label">Parent company capital</span>
          <h1 className="sx-h heading-1">Treasury</h1>
          <p className="body-s muted">Manage liquidity and long-term positions for {data?.company.name ?? "the parent company"}. Branch operating funds stay separate.</p>
        </div>
        <button type="button" className="sx-btn sx-btn--secondary" onClick={() => refresh().catch((cause) => setError(String(cause)))}>Refresh</button>
      </header>

      {error ? <div className="empty" role="alert">{error}</div> : null}
      <div className="grid treasury-grid">
        <section className="treasury-overview s12" aria-labelledby="treasury-total">
          <div className="treasury-overview__lead">
            <span className="sx-label">Total parent treasury</span>
            <span className="amount-xl" id="treasury-total">{data ? usd(totalValueMinor.toString()) : loading ? "…" : "—"}</span>
            <span className="body-s muted">Liquid balances and current investment positions</span>
          </div>
          <div className="treasury-overview__balances">
            <div><span>USDC</span><strong>{data ? usd(data.assets.usdcMinor) : "—"}</strong><small>Available on Arc</small></div>
            <div><span>fUSDC</span><strong>{data ? usd(data.assets.fUsdcMinor) : "—"}</strong><small>Internal liquidity</small></div>
            <div><span>Investments</span><strong>{data ? usd((equityValueMinor + yieldValueMinor).toString()) : "—"}</strong><small>Stocks and yield</small></div>
            <div><span>Agent revenue</span><strong>{data ? usd(data.assets.gatewayUsdcMinor) : "—"}</strong><small>{data?.earnings.calls ?? 0} paid calls</small></div>
          </div>
        </section>

        <section className="treasury-workspace s8" aria-labelledby="portfolio-heading">
          <div className="treasury-section-head">
            <div><span className="sx-label">Allocations</span><h2 id="portfolio-heading">Portfolio</h2></div>
            <span className="data">{usd((equityValueMinor + yieldValueMinor).toString())} invested</span>
          </div>

          <div className="treasury-position-group">
            <div className="treasury-position-group__head"><div><h3>Tokenized stocks</h3><p>ERC-20 positions funded with parent-company fUSDC.</p></div><span className="sx-pill">Arc</span></div>
            {equities?.portfolio.map((asset) => <div className="treasury-position" key={asset.symbol}><div><strong>{asset.symbol}</strong><span>{asset.name}</span></div><span>{Number(asset.shares).toLocaleString(undefined, { maximumFractionDigits: 6 })} shares</span><span className="data">{usd(asset.valueMinor)}</span></div>)}
            {!equities ? <div className="treasury-position treasury-position--empty">No stock positions loaded.</div> : null}
            <details className="treasury-action">
              <summary>Trade stock positions</summary>
              <div className="treasury-action__body">
                <div className="treasury-field"><label htmlFor="trade-amount">fUSDC to invest</label><input id="trade-amount" className="sx-input" inputMode="decimal" value={tradeAmount} disabled={!equities} onChange={(event) => setTradeAmount(event.target.value)} /></div>
                <div className="form-row">{(["NVDA", "GOOGL"] as const).map((symbol) => <button className="sx-btn sx-btn--secondary" key={symbol} type="button" disabled={busy !== null || !equities} onClick={() => void post("/api/sancus/treasury/equities", { action: "BUY", symbol, amount: tradeAmount }, `buy-${symbol}`)}>{busy === `buy-${symbol}` ? "Buying…" : `Buy ${symbol}`}</button>)}</div>
                <div className="treasury-field"><label htmlFor="sell-amount">Shares to sell</label><input id="sell-amount" className="sx-input" inputMode="decimal" value={sellAmount} disabled={!equities} onChange={(event) => setSellAmount(event.target.value)} /></div>
                <div className="form-row">{(["NVDA", "GOOGL"] as const).map((symbol) => <button className="sx-btn sx-btn--quiet" key={symbol} type="button" disabled={busy !== null || !equities} onClick={() => void post("/api/sancus/treasury/equities", { action: "SELL", symbol, amount: sellAmount }, `sell-${symbol}`)}>{busy === `sell-${symbol}` ? "Selling…" : `Sell ${symbol}`}</button>)}</div>
              </div>
            </details>
          </div>

          <div className="treasury-position-group">
            <div className="treasury-position-group__head"><div><h3>Yield</h3><p>Canonical USDC earning in Arc vaults.</p></div><span className="sx-pill">EarnKit</span></div>
            {yieldData?.vaults.length ? yieldData.vaults.slice(0, 3).map((vault) => {
              const position = yieldData.positions.find((item) => item.vaultAddress.toLowerCase() === vault.vaultAddress.toLowerCase())
              return <div className="treasury-position" key={vault.vaultAddress}><div><strong>{vault.name}</strong><span>{vault.protocol}</span></div><span>{Number(vault.currentApy).toFixed(2)}% APY</span><span className="data">${Number(position?.currentBalance ?? 0).toFixed(2)}</span></div>
            }) : <div className="treasury-position treasury-position--empty">No Arc USDC vaults are available.</div>}
            <details className="treasury-action">
              <summary>Manage yield position</summary>
              <div className="treasury-action__body">
                <div className="treasury-field"><label htmlFor="yield-vault">Vault</label><select id="yield-vault" className="sx-input" value={yieldVaultAddress} disabled={!yieldData?.vaults.length} onChange={(event) => setYieldVaultAddress(event.target.value)}>{yieldData?.vaults.map((vault) => <option key={vault.vaultAddress} value={vault.vaultAddress}>{vault.name} · {Number(vault.currentApy).toFixed(2)}% APY</option>)}</select></div>
                <div className="treasury-field"><label htmlFor="yield-amount">Canonical USDC amount</label><input id="yield-amount" className="sx-input" inputMode="decimal" value={yieldAmount} disabled={!selectedYieldVault} onChange={(event) => setYieldAmount(event.target.value)} /></div>
                <div className="form-row treasury-action__buttons"><button className="sx-btn sx-btn--secondary" type="button" disabled={busy !== null || !selectedYieldVault} onClick={() => selectedYieldVault && void post("/api/sancus/treasury/yield", { action: "DEPOSIT", vaultAddress: selectedYieldVault.vaultAddress, amount: yieldAmount }, "yield")}>{busy === "yield" ? "Depositing…" : "Deposit"}</button><button className="sx-btn sx-btn--quiet" type="button" disabled={busy !== null || !selectedYieldVault} onClick={() => selectedYieldVault && void post("/api/sancus/treasury/yield", { action: "WITHDRAW", vaultAddress: selectedYieldVault.vaultAddress, amount: yieldAmount }, "withdraw-yield")}>{busy === "withdraw-yield" ? "Withdrawing…" : "Withdraw"}</button></div>
              </div>
            </details>
          </div>
        </section>

        <aside className="treasury-rail s4" aria-labelledby="account-heading">
          <div className="treasury-section-head"><div><span className="sx-label">Infrastructure</span><h2 id="account-heading">Treasury account</h2></div></div>
          {data?.wallet ? <div className="treasury-account"><div><span>Network</span><strong>{data.wallet.blockchain}</strong></div><div><span>Wallet</span><strong className="data">{short(data.wallet.address)}</strong></div><a className="sx-btn sx-btn--secondary" target="_blank" rel="noreferrer" href={`https://explorer.testnet.arc.io/address/${data.wallet.address}`}>View on Arc</a></div> : null}
          {!data?.gatewaySigner ? <div className="empty"><p>{data?.wallet ? "Finish Gateway setup to collect paid agent requests." : "Set up the parent-company Arc wallet and Gateway signer."}</p><button className="sx-btn sx-btn--secondary" type="button" disabled={!data || busy !== null} onClick={() => void setupParentTreasury()}>{busy === "setup" ? "Setting up…" : data?.wallet ? "Complete Gateway setup" : "Set up treasury"}</button></div> : null}

          <div className="treasury-readiness">
            <div><span>USDC liquidity</span><span className={`sx-pill ${data?.assets.readiness?.canonicalUsdc ? "sx-pill--settled" : "sx-pill--warning"}`}>{data?.assets.readiness?.canonicalUsdc ? "Ready" : "Needs funds"}</span></div>
            <div><span>fUSDC liquidity</span><span className={`sx-pill ${data?.assets.readiness?.internalLiquidity ? "sx-pill--settled" : "sx-pill--warning"}`}>{data?.assets.readiness?.internalLiquidity ? "Ready" : "Low"}</span></div>
            <button className="sx-btn sx-btn--quiet" type="button" disabled={busy !== null || !data?.wallet} onClick={() => void post("/api/sancus/treasury/readiness", {}, "readiness")}>{busy === "readiness" ? "Checking…" : "Check test liquidity"}</button>
          </div>

          <div className="treasury-gateway">
            <div><span className="sx-label">Agent revenue</span><strong>{data ? usd(data.assets.gatewayUsdcMinor) : "—"}</strong><small>{data?.earnings.calls ?? 0} paid requests · {data ? usd(data.earnings.totalMinor) : "—"} recorded</small></div>
            <div className="treasury-field"><label htmlFor="gateway-amount">USDC to move</label><input id="gateway-amount" className="sx-input" inputMode="decimal" placeholder="0.00" value={gatewayAmount} disabled={!data?.wallet || gatewayAvailable <= 2.01} onChange={(event) => setGatewayAmount(event.target.value)} /><small>{gatewayAvailable <= 2.01 ? "Revenue becomes movable after it covers the 2.01 USDC Gateway fee." : `${usd(data?.assets.gatewayUsdcMinor ?? "0")} available · fee included.`}</small></div>
            <button className="sx-btn sx-btn--secondary" type="button" disabled={busy !== null || !data?.wallet || !gatewayTransferValid} onClick={() => void post("/api/sancus/treasury/gateway", { amount: gatewayAmount }, "gateway")}>{busy === "gateway" ? "Moving…" : "Move to treasury"}</button>
          </div>
          {data?.warnings.map((warning) => <span className="body-s muted" key={warning}>{warning}</span>)}
        </aside>

        <section className="treasury-activity s12" aria-labelledby="treasury-activity">
          <div className="treasury-section-head"><div><span className="sx-label">History</span><h2 id="treasury-activity">Recent activity</h2></div><a className="sx-btn sx-btn--quiet" href="/api/x402" target="_blank" rel="noreferrer">Open paid API</a></div>
          {data?.activity.length ? data.activity.map((item) => <div className="treasury-activity__row" key={item.id}><span className="sx-label">{item.kind}</span><span><strong>{item.label}</strong><small>{new Date(item.createdAt).toLocaleString()}</small></span><span className="data">{item.currency === "fUSDC" ? `${usd(item.amount)} fUSDC` : usd(item.amount)}</span><span className={`sx-pill ${item.status === "CONFIRMED" ? "sx-pill--settled" : item.status === "FAILED" ? "sx-pill--failed" : "sx-pill--warning"}`}>{item.status}</span></div>) : <div className="empty">No parent-company treasury activity yet.</div>}
        </section>
      </div>
    </div>
  )
}
