"use client"

// Development tools for payment-rail and Arc testnet workflow validation.
import Link from "next/link"
import Image from "next/image"
import { useCallback, useEffect, useMemo, useState } from "react"
import { can, useAccount } from "@/lib/sancus/use-account"
import type { SancusCardDto } from "@/lib/sancus/cards"
import type { CompanyNode } from "@/lib/sancus/companies"
import type { SpendingMethodDto } from "@/lib/sancus/local-rails"
import type { LocalRail } from "@/lib/sancus/local-sandboxes"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"
import { encodeReceiveCode, RECEIVE_RAILS } from "@/lib/sancus/receive-code"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"

type Log = { at: string; rail: string; ok: boolean; status: number; body: unknown }
type ReceiveWorkflow = {
  collection?: { id?: string; status?: string; mintExplorer?: string | null; qrImageUrl?: string | null; qrPayload?: string | null; simulatorUrl?: string | null }
  workflow?: Record<string, { ok: boolean; detail: string; transaction?: string | null }>
  error?: string
  runId?: string
}
type WorkflowResult = { workflow?: Record<string, { ok: boolean; detail: string }>; error?: string; runId?: string; payment?: { id?: string; status?: string } }
type SpendKind = "PIX" | "CARD"
type ProviderReadiness = { id: string; label: string; ready: boolean; detail: string }
type DevRun = { id: string; run_type: string; provider: string; status: string; error: string | null; created_at: string }
type StoredPixQr = {
  id: string
  payload: string
  label: string
  status: string
  amountBrlMinor: string
  createdAt: string
  source: "COLLECTION" | "DEV_COLLECTION"
}
type DevSpendMethod = {
  id: string
  kind: SpendKind
  source: "CARD" | "SPENDING_METHOD"
  employeeName: string
  label: string
  currency: string
  detail: string
}

const RECEIVE_TEST_AMOUNT: Record<LocalRail, string> = { QRIS: "150000", PROMPTPAY: "100.00", PIX: "5.00" }

function flatten(nodes: CompanyNode[]): CompanyNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)])
}

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`
}

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { cache: "no-store", ...init })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = await res.text()
  }
  return { status: res.status, ok: res.ok, body }
}

export function DevQaDashboard() {
  const { account } = useAccount()
  const workspace = useWorkspace()
  const treasury = useLiveTreasury()
  const [amount, setAmount] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [receiveRail, setReceiveRail] = useState<LocalRail>("PIX")
  const [receiveBranchId, setReceiveBranchId] = useState("")
  const [receiveAmount, setReceiveAmount] = useState("5.00")
  const [receiveResult, setReceiveResult] = useState<ReceiveWorkflow | null>(null)
  const [spendMethods, setSpendMethods] = useState<DevSpendMethod[]>([])
  const [spendKind, setSpendKind] = useState<SpendKind>("PIX")
  const [spendMethodId, setSpendMethodId] = useState("")
  const [spendMerchant, setSpendMerchant] = useState("Dev Test Merchant")
  const [spendAmount, setSpendAmount] = useState("10.00")
  const [storedPixQrs, setStoredPixQrs] = useState<StoredPixQr[]>([])
  const [spendPixQrId, setSpendPixQrId] = useState("")
  const [spendResult, setSpendResult] = useState<WorkflowResult | null>(null)
  const [providers, setProviders] = useState<ProviderReadiness[]>([])
  const [recentRuns, setRecentRuns] = useState<DevRun[]>([])

  const push = useCallback((rail: string, result: { status: number; ok: boolean; body: unknown }) => {
    setLogs((prev) => [{ at: new Date().toLocaleTimeString(), rail, ...result }, ...prev].slice(0, 40))
  }, [])

  async function run(rail: string, fn: () => Promise<{ status: number; ok: boolean; body: unknown }>) {
    setBusy(rail)
    try {
      push(rail, await fn())
    } catch (err) {
      push(rail, { status: 0, ok: false, body: { error: (err as Error).message } })
    } finally {
      setBusy(null)
    }
  }

  const sgd = amount.trim() || "1.00"
  const usd = amount.trim() || "1.00"
  const brl = amount.trim() || "5.00"
  const receiveBranches = useMemo(
    () => flatten(workspace.tree).filter((node) => node.parentId !== null && node.currency === RECEIVE_RAILS[receiveRail].currency),
    [receiveRail, workspace.tree]
  )
  const receiveBranch = receiveBranches.find((node) => node.id === receiveBranchId) ?? receiveBranches[0] ?? null
  const receiveCode = receiveBranch ? encodeReceiveCode({ rail: receiveRail, companyId: receiveBranch.id }) : ""
  const availableSpendMethods = useMemo(() => spendMethods.filter((method) => method.kind === spendKind), [spendKind, spendMethods])
  const spendMethod = availableSpendMethods.find((method) => method.id === spendMethodId) ?? availableSpendMethods[0] ?? null
  const spendPixQr = storedPixQrs.find((qr) => qr.id === spendPixQrId) ?? storedPixQrs[0] ?? null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [cardsResult, methodsResult, readinessResult, runsResult, pixQrsResult] = await Promise.all([
        call("/api/sancus/cards"),
        call("/api/sancus/spending-methods"),
        call("/api/sancus/dev/readiness"),
        call("/api/sancus/dev/runs"),
        call("/api/sancus/dev/pix-qrs"),
      ])
      if (cancelled) return
      const cards = ((cardsResult.body as { cards?: SancusCardDto[] })?.cards ?? [])
        .filter((card) => card.status === "ACTIVE" && !card.simulated)
        .map<DevSpendMethod>((card) => ({
          id: card.id,
          kind: "CARD",
          source: "CARD",
          employeeName: card.employeeName,
          label: card.label,
          currency: card.currency,
          detail: `Card •••• ${card.lastFour}`,
        }))
      const methods = ((methodsResult.body as { methods?: SpendingMethodDto[] })?.methods ?? [])
        .filter((method) => method.status === "ACTIVE" && method.type === "PIX")
        .map<DevSpendMethod>((method) => ({
          id: method.id,
          kind: method.type as SpendKind,
          source: "SPENDING_METHOD",
          employeeName: method.employeeName,
          label: method.label,
          currency: method.currency,
          detail: method.type === "PIX" ? "Pix QR access" : "Card access",
        }))
      setSpendMethods([...cards, ...methods])
      setProviders((readinessResult.body as { providers?: ProviderReadiness[] })?.providers ?? [])
      setRecentRuns((runsResult.body as { runs?: DevRun[] })?.runs ?? [])
      setStoredPixQrs((pixQrsResult.body as { qrs?: StoredPixQr[] })?.qrs ?? [])
    })()
    return () => { cancelled = true }
  }, [])

  async function runSpendTest() {
    if (!spendMethod || !Number.isFinite(Number(spendAmount)) || Number(spendAmount) <= 0 || !spendMerchant.trim()) return
    const id = `spend-${spendKind.toLowerCase()}`
    setBusy(id)
    setSpendResult(null)
    try {
      const result = await call("/api/sancus/dev/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: spendKind,
          source: spendMethod.source,
          methodId: spendMethod.id,
          merchantName: spendMerchant.trim(),
          amount: Number(spendAmount),
          ...(spendKind === "PIX" ? { qrPayload: spendPixQr?.payload ?? "" } : {}),
        }),
      })
      setSpendResult(result.body as WorkflowResult)
      push(id, result)
      if (result.ok) signalSancusDataChanged()
      const refreshed = await call("/api/sancus/dev/runs")
      setRecentRuns((refreshed.body as { runs?: DevRun[] })?.runs ?? [])
    } catch (error) {
      const result = { status: 0, ok: false, body: { error: error instanceof Error ? error.message : String(error) } }
      setSpendResult(result.body)
      push(id, result)
    } finally {
      setBusy(null)
    }
  }

  async function refreshPixSpend() {
    const paymentId = spendResult?.payment?.id
    if (!paymentId) return
    setBusy("spend-pix-refresh")
    try {
      const result = await call(`/api/sancus/dev/spend/${paymentId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: spendResult?.runId }),
      })
      setSpendResult((previous) => ({ ...(previous ?? {}), ...(result.body as WorkflowResult) }))
      push("spend-pix-refresh", result)
      if (result.ok) signalSancusDataChanged()
      const refreshed = await call("/api/sancus/dev/runs")
      setRecentRuns((refreshed.body as { runs?: DevRun[] })?.runs ?? [])
    } finally {
      setBusy(null)
    }
  }

  async function refreshReceive(action: "REFRESH" | "MARK_PAID") {
    const collectionId = receiveResult?.collection?.id
    if (!collectionId) return
    const id = "receive-refresh"
    setBusy(id)
    try {
      const result = await call(`/api/sancus/dev/receive-payment/${collectionId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, runId: receiveResult?.runId }),
      })
      setReceiveResult((previous) => ({ ...(previous ?? {}), ...(result.body as ReceiveWorkflow) }))
      push(id, result)
      if (result.ok) signalSancusDataChanged()
      const refreshed = await call("/api/sancus/dev/runs")
      setRecentRuns((refreshed.body as { runs?: DevRun[] })?.runs ?? [])
    } finally {
      setBusy(null)
    }
  }

  async function sendFakeReceivePayment() {
    if (!receiveBranch || !Number.isFinite(Number(receiveAmount)) || Number(receiveAmount) <= 0) return
    const id = "receive-qr"
    setBusy(id)
    setReceiveResult(null)
    const amountMinor = String(Math.round(Number(receiveAmount) * 100))
    try {
      const result = await call("/api/sancus/dev/receive-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rail: receiveRail, companyId: receiveBranch.id, amountMinor }),
      })
      setReceiveResult(result.body as ReceiveWorkflow)
      push(id, result)
      if (result.ok) signalSancusDataChanged()
      const refreshed = await call("/api/sancus/dev/runs")
      setRecentRuns((refreshed.body as { runs?: DevRun[] })?.runs ?? [])
    } catch (error) {
      const result = { status: 0, ok: false, body: { error: error instanceof Error ? error.message : String(error) } }
      setReceiveResult(result.body)
      push(id, result)
    } finally {
      setBusy(null)
    }
  }

  const rows: { id: string; title: string; detail: string; needsSend?: boolean; run: () => Promise<{ status: number; ok: boolean; body: unknown }> }[] = [
    {
      id: "treasury",
      title: "Treasury balance",
      detail: "GET /api/sancus/treasury — on-chain Available",
      run: () => call("/api/sancus/treasury"),
    },
    {
      id: "paynow-quote",
      title: "PayNow quote",
      detail: `POST /api/sancus/payouts/quote · S$ ${sgd}`,
      run: () =>
        call("/api/sancus/payouts/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { name: "QA Tan Logistics", proxyType: "MOBILE", proxyValue: "+6591234567" },
            sgdAmount: sgd,
          }),
        }),
    },
    {
      id: "paynow-send",
      title: "PayNow send",
      detail: `POST /api/sancus/payouts · S$ ${sgd} (live Arc when funded)`,
      needsSend: true,
      run: () =>
        call("/api/sancus/payouts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
          body: JSON.stringify({
            recipient: { name: "QA Tan Logistics", proxyType: "MOBILE", proxyValue: "+6591234567" },
            sgdAmount: sgd,
            reference: "Dev QA PayNow",
          }),
        }),
    },
    {
      id: "fast-quote",
      title: "FAST quote",
      detail: `POST /api/sancus/payouts/quote · bank account · S$ ${sgd}`,
      run: () =>
        call("/api/sancus/payouts/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { name: "QA DBS Account", proxyType: "BANK", proxyValue: "0123456789", bankCode: "DBSSSGSG" },
            sgdAmount: sgd,
          }),
        }),
    },
    {
      id: "ach-recipients",
      title: "ACH recipients",
      detail: "GET /api/sancus/recipients",
      run: () => call("/api/sancus/recipients"),
    },
    {
      id: "ach-quote",
      title: "ACH quote",
      detail: `POST /api/sancus/payments/quote · US$ ${usd} (uses first saved recipient)`,
      needsSend: true,
      run: async () => {
        const list = await call("/api/sancus/recipients")
        const recipients = (list.body as { recipients?: { id: string }[] })?.recipients ?? []
        if (!recipients[0]) return { status: 400, ok: false, body: { error: "No ACH recipient yet — add one on Pay › US bank" } }
        return call("/api/sancus/payments/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: recipients[0].id, usdAmount: usd, speed: "STANDARD" }),
        })
      },
    },
    {
      id: "ach-send",
      title: "ACH send",
      detail: `POST /api/sancus/payments · US$ ${usd}`,
      needsSend: true,
      run: async () => {
        const list = await call("/api/sancus/recipients")
        const recipients = (list.body as { recipients?: { id: string }[] })?.recipients ?? []
        if (!recipients[0]) return { status: 400, ok: false, body: { error: "No ACH recipient yet — add one on Pay › US bank" } }
        return call("/api/sancus/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
          body: JSON.stringify({ recipientId: recipients[0].id, usdAmount: usd, speed: "STANDARD" }),
        })
      },
    },
    {
      id: "pix-send",
      title: "Pix send",
      detail: `POST /api/sancus/pix/payments · R$ ${brl}`,
      needsSend: true,
      run: () =>
        call("/api/sancus/pix/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": newKey() },
          body: JSON.stringify({
            purpose: "SUPPLIER_PAYMENT",
            recipientName: "QA Juliana Costa",
            amountBrl: Number.parseFloat(brl),
            pixKey: "qa.pix@example.com",
            description: "Dev QA Pix",
          }),
        }),
    },
    {
      id: "quote-pix",
      title: "Indicative Pix quote",
      detail: `POST /api/sancus/pay/quote · USDC → BRL`,
      run: () =>
        call("/api/sancus/pay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rail: "Pix", side: "send", amount: usd || "1.00" }),
        }),
    },
    {
      id: "quote-sepa",
      title: "Indicative SEPA quote",
      detail: "POST /api/sancus/pay/quote · USDC → EUR",
      run: () =>
        call("/api/sancus/pay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rail: "SEPA", side: "send", amount: usd || "1.00" }),
        }),
    },
    {
      id: "quote-spei",
      title: "Indicative SPEI quote",
      detail: "POST /api/sancus/pay/quote · USDC → MXN",
      run: () =>
        call("/api/sancus/pay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rail: "SPEI", side: "send", amount: usd || "1.00" }),
        }),
    },
    {
      id: "quote-wire",
      title: "Indicative Wire quote",
      detail: "POST /api/sancus/pay/quote · USDC → USD",
      run: () =>
        call("/api/sancus/pay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rail: "Wire", side: "send", amount: usd || "1.00" }),
        }),
    },
    {
      id: "activity",
      title: "List payouts",
      detail: "GET /api/sancus/payouts",
      run: () => call("/api/sancus/payouts"),
    },
  ]

  const canSend = can(account, "money.send")

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Dev</h1>
          <p className="body-s muted" style={{ margin: "6px 0 0" }}>
            Debug payment rails and verify each crypto step. Account:{" "}
            <b>{account?.type ?? "guest"}</b>
            {account?.label ? ` · ${account.label}` : ""}.
          </p>
        </div>
        <span className="sx-pill sx-pill--held">Sandbox tools</span>
      </header>

      <div className="grid">
        <section className="tile s12" aria-labelledby="provider-readiness">
          <div className="tile-head">
            <div>
              <h2 className="tile-title" id="provider-readiness">Provider readiness</h2>
              <p className="body-s muted" style={{ margin: "4px 0 0" }}>A test runs only when its real sandbox credentials are available.</p>
            </div>
          </div>
          <div className="grid" style={{ gap: 10 }}>
            {providers.map((provider) => (
              <div className="kv s4" key={provider.id}>
                <span><b>{provider.label}</b><br /><span className="body-s muted">{provider.detail}</span></span>
                <span className={provider.ready ? "sx-pill sx-pill--settled" : "sx-pill sx-pill--failed"}>{provider.ready ? "Ready" : "Unavailable"}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="tile s4">
          <span className="sx-label">Live Available</span>
          <span className="big">{treasury.availableLabel}</span>
          <span className="body-s muted">{treasury.meta || "—"}</span>
        </section>
        <section className="tile s8">
          <label className="sx-field" style={{ margin: 0 }}>
            <span className="sx-label">Test amount (optional)</span>
            <input
              className="sx-field__input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave blank for $1 / S$1 / R$5 defaults"
              inputMode="decimal"
            />
            <span className="sx-field__help">Used as SGD for PayNow/FAST, USD for ACH/quotes, BRL for Pix.</span>
          </label>
        </section>

        <section className="tile s12" aria-labelledby="test-employee-spending">
          <div className="tile-head">
            <div>
              <h2 className="tile-title" id="test-employee-spending">Test employee spending</h2>
              <p className="body-s muted" style={{ margin: "4px 0 0" }}>
                Use an issued employee method, enforce its monthly limit, and record the sandbox transaction in Spending and Activity.
              </p>
            </div>
            <span className="sx-rail">issued access → limit → payment</span>
          </div>

          <div className="filters" role="group" aria-label="Spending method">
            {(["PIX", "CARD"] as SpendKind[]).map((kind) => (
              <button
                type="button"
                className="chip"
                aria-pressed={spendKind === kind}
                key={kind}
                onClick={() => {
                  setSpendKind(kind)
                  setSpendMethodId("")
                  setSpendAmount(kind === "PIX" ? "10.00" : "25.00")
                  setSpendResult(null)
                }}
              >
                {kind === "PIX" ? "Pix spending" : "Credit card spending"}
              </button>
            ))}
          </div>

          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s5">
              <span className="sx-label">Issued to employee</span>
              <select
                className="sx-field__input"
                value={spendMethod?.id ?? ""}
                onChange={(event) => { setSpendMethodId(event.target.value); setSpendResult(null) }}
                disabled={!availableSpendMethods.length}
              >
                {!availableSpendMethods.length ? <option value="">No active {spendKind === "PIX" ? "Pix access" : "cards"}</option> : null}
                {availableSpendMethods.map((method) => (
                  <option value={method.id} key={`${method.source}-${method.id}`}>
                    {method.employeeName} · {method.detail} · {method.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="sx-field s4">
              <span className="sx-label">Merchant</span>
              <input className="sx-field__input" value={spendMerchant} onChange={(event) => setSpendMerchant(event.target.value)} />
            </label>
            <label className="sx-field s3">
              <span className="sx-label">Amount · {spendMethod?.currency ?? (spendKind === "PIX" ? "BRL" : "local")}</span>
              <input className="sx-field__input" inputMode="decimal" value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} />
            </label>
            {spendKind === "PIX" ? (
              <label className="sx-field s12">
                <span className="sx-label">Stored merchant Pix QR</span>
                <select
                  className="sx-field__input"
                  value={spendPixQr?.id ?? ""}
                  onChange={(event) => { setSpendPixQrId(event.target.value); setSpendResult(null) }}
                  disabled={!storedPixQrs.length}
                >
                  {!storedPixQrs.length ? <option value="">No stored Pix QR codes</option> : null}
                  {storedPixQrs.map((qr) => (
                    <option value={qr.id} key={qr.id}>
                      {qr.label} · R$ {(Number(qr.amountBrlMinor) / 100).toFixed(2)} · {qr.status.toLowerCase()}
                    </option>
                  ))}
                </select>
                <span className="sx-field__help">
                  Select a PayZu EMV payload already stored by a Pix collection. Create one under Test incoming QR payments if this list is empty.
                </span>
              </label>
            ) : null}
          </div>

          {!availableSpendMethods.length ? (
            <p className="body-s muted" style={{ margin: 0 }}>
              Issue {spendKind === "PIX" ? "Pix access" : "a card"} on <Link href="/spending">Spending</Link> before running this test.
            </p>
          ) : null}

          <div className="tile-foot">
            <span className="body-s muted">Sandbox only. No production card or Pix payment is sent.</span>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              disabled={Boolean(busy) || !spendMethod || Number(spendAmount) <= 0 || !spendMerchant.trim() || (spendKind === "PIX" && !spendPixQr)}
              onClick={() => void runSpendTest()}
            >
              {busy === `spend-${spendKind.toLowerCase()}` ? "Running spend…" : `Run ${spendKind === "PIX" ? "Pix" : "card"} spend`}
            </button>
          </div>

          {spendResult ? (
            <div style={{ display: "grid", gap: 8 }} role="status">
              {spendResult.error ? <span className="body-s" style={{ color: "var(--failed)" }}>{spendResult.error}</span> : null}
              {Object.entries(spendResult.workflow ?? {}).map(([step, result]) => (
                <div className="kv" key={step}>
                  <span><b>{step}</b> · {result.detail}</span>
                  <span className={result.ok ? "sx-pill sx-pill--settled" : "sx-pill sx-pill--failed"}>{result.ok ? "Passed" : "Failed"}</span>
                </div>
              ))}
              <div className="filters">
                {spendKind === "PIX" && spendResult.payment?.id && spendResult.payment.status === "PENDING" ? <button type="button" className="sx-btn sx-btn--quiet" disabled={Boolean(busy)} onClick={() => void refreshPixSpend()}>Refresh PayZu status</button> : null}
                <Link href="/spending" className="sx-btn sx-btn--quiet">Open Spending</Link>
                <Link href="/activity" className="sx-btn sx-btn--quiet">Open Activity</Link>
              </div>
            </div>
          ) : null}
        </section>

        <section className="tile s12" aria-labelledby="test-receive-qr">
          <div className="tile-head">
            <div>
              <h2 className="tile-title" id="test-receive-qr">Test incoming QR payments</h2>
              <p className="body-s muted" style={{ margin: "4px 0 0" }}>
                Creates a real provider sandbox charge. Complete it in the provider simulator, refresh it, and verify the Arc testnet mint.
              </p>
            </div>
            <span className="sx-rail">receive → rail → Arc</span>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s3">
              <span className="sx-label">Rail</span>
              <select className="sx-field__input" value={receiveRail} onChange={(event) => { const next = event.target.value as LocalRail; setReceiveRail(next); setReceiveAmount(RECEIVE_TEST_AMOUNT[next]); setReceiveBranchId(""); setReceiveResult(null) }}>
                {(Object.keys(RECEIVE_RAILS) as LocalRail[]).map((rail) => <option value={rail} key={rail}>{RECEIVE_RAILS[rail].label}</option>)}
              </select>
            </label>
            <label className="sx-field s5">
              <span className="sx-label">QR belongs to</span>
              <select className="sx-field__input" value={receiveBranch?.id ?? ""} onChange={(event) => { setReceiveBranchId(event.target.value); setReceiveResult(null) }} disabled={!receiveBranches.length}>
                {!receiveBranches.length ? <option value="">No {RECEIVE_RAILS[receiveRail].currency} branch</option> : null}
                {receiveBranches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
              </select>
            </label>
            <label className="sx-field s4">
              <span className="sx-label">Fake payer enters · {RECEIVE_RAILS[receiveRail].currency}</span>
              <input className="sx-field__input" inputMode="decimal" value={receiveAmount} onChange={(event) => setReceiveAmount(event.target.value)} />
            </label>
            <div className="s12" style={{ display: "grid", gap: 6 }}>
              <span className="sx-label">Scanned receive identity</span>
              <code className="body-s" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", overflowWrap: "anywhere", background: "var(--surface-000)" }}>{receiveCode || "No matching branch"}</code>
            </div>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">This writes sandbox activity and can mint test tokens; it never moves production money.</span>
            <button type="button" className="sx-btn sx-btn--primary" disabled={Boolean(busy) || !receiveBranch || Number(receiveAmount) <= 0} onClick={sendFakeReceivePayment}>
              {busy === "receive-qr" ? "Validating…" : "Send fake payment & validate"}
            </button>
          </div>
          {receiveResult ? (
            <div style={{ display: "grid", gap: 8 }} role="status">
              {receiveResult.error ? <span className="body-s" style={{ color: "var(--failed)" }}>{receiveResult.error}</span> : null}
              {Object.entries(receiveResult.workflow ?? {}).map(([step, result]) => (
                <div className="kv" key={step}>
                  <span><b>{step}</b> · {result.detail}</span>
                  <span className={result.ok ? "sx-pill sx-pill--settled" : "sx-pill sx-pill--failed"}>{result.ok ? "Passed" : "Failed"}</span>
                </div>
              ))}
              {receiveResult.collection?.qrImageUrl ? <Image unoptimized width={220} height={220} src={receiveResult.collection.qrImageUrl} alt="Provider-generated payment QR" style={{ width: 220, maxWidth: "100%", height: "auto", border: "1px solid var(--line)", borderRadius: 12 }} /> : null}
              {receiveResult.collection?.qrPayload ? <code className="body-s" style={{ overflowWrap: "anywhere" }}>{receiveResult.collection.qrPayload}</code> : null}
              <div className="filters">
                {receiveResult.collection?.simulatorUrl ? <a href={receiveResult.collection.simulatorUrl} target="_blank" rel="noreferrer" className="sx-btn sx-btn--quiet">Open provider simulator</a> : null}
                {receiveResult.collection?.id ? <button type="button" className="sx-btn sx-btn--quiet" disabled={Boolean(busy)} onClick={() => void refreshReceive("REFRESH")}>Refresh provider status</button> : null}
                {receiveRail === "PROMPTPAY" && receiveResult.collection?.id ? <button type="button" className="sx-btn sx-btn--quiet" disabled={Boolean(busy)} onClick={() => void refreshReceive("MARK_PAID")}>Mark paid in Omise test mode</button> : null}
              </div>
              {receiveResult.collection?.mintExplorer ? <a href={receiveResult.collection.mintExplorer} target="_blank" rel="noreferrer" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>View mint on Arc explorer</a> : null}
            </div>
          ) : null}
        </section>

        <section className="tile s12" aria-labelledby="recent-dev-runs">
          <div className="tile-head"><h2 className="tile-title" id="recent-dev-runs">Recent Payment Lab runs</h2><span className="sx-rail">persisted audit trail</span></div>
          {!recentRuns.length ? <span className="body-s muted">No runs yet.</span> : recentRuns.map((run) => (
            <div className="kv" key={run.id}>
              <span><b>{run.run_type.replaceAll("_", " ")}</b> · {run.provider}<br /><span className="body-s muted">{new Date(run.created_at).toLocaleString()}{run.error ? ` · ${run.error}` : ""}</span></span>
              <span className={run.status === "PASSED" ? "sx-pill sx-pill--settled" : run.status === "FAILED" ? "sx-pill sx-pill--failed" : "sx-pill sx-pill--held"}>{run.status}</span>
            </div>
          ))}
        </section>

        {rows.map((r) => {
          const blocked = r.needsSend && !canSend
          return (
            <section className="tile s6" key={r.id}>
              <div className="tile-head">
                <h2 className="tile-title">{r.title}</h2>
                <span className="sx-rail">{r.id}</span>
              </div>
              <p className="body-s muted" style={{ margin: 0 }}>
                {r.detail}
              </p>
              {blocked ? (
                <span className="body-s" style={{ color: "var(--held)" }}>
                  This account cannot send money ({account?.type}).
                </span>
              ) : null}
              <div className="tile-foot">
                <button
                  type="button"
                  className="sx-btn sx-btn--primary"
                  disabled={Boolean(busy) || blocked}
                  onClick={() => run(r.id, r.run)}
                >
                  {busy === r.id ? "Running…" : "Run test"}
                </button>
              </div>
            </section>
          )
        })}

        <section className="tile s12" aria-label="Results">
          <div className="tile-head">
            <h2 className="tile-title">Results</h2>
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setLogs([])} disabled={!logs.length}>
              Clear
            </button>
          </div>
          {logs.length === 0 ? (
            <span className="body-s muted">Run a test to see status codes and JSON here.</span>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {logs.map((l, i) => (
                <div key={`${l.at}-${l.rail}-${i}`} style={{ display: "grid", gap: 6 }}>
                  <div className="kv">
                    <span>
                      <b>{l.rail}</b> · {l.at}
                    </span>
                    <span className={l.ok ? "sx-pill sx-pill--settled" : "sx-pill sx-pill--failed"}>{l.status || "err"}</span>
                  </div>
                  <pre
                    className="body-s"
                    style={{
                      margin: 0,
                      padding: 12,
                      overflow: "auto",
                      maxHeight: 220,
                      background: "var(--surface-000)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--line)",
                    }}
                  >
                    {typeof l.body === "string" ? l.body : JSON.stringify(l.body, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
