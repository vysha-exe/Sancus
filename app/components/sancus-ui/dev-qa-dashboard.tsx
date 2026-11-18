"use client"

// Development tools for payment-rail and Arc testnet workflow validation.
import { useCallback, useMemo, useState } from "react"
import { can, useAccount } from "@/lib/sancus/use-account"
import type { CompanyNode } from "@/lib/sancus/companies"
import type { LocalRail } from "@/lib/sancus/local-sandboxes"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"
import { encodeReceiveCode, RECEIVE_RAILS } from "@/lib/sancus/receive-code"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"

type Log = { at: string; rail: string; ok: boolean; status: number; body: unknown }
type ReceiveWorkflow = {
  collection?: { status?: string; mintExplorer?: string | null }
  workflow?: Record<string, { ok: boolean; detail: string; transaction?: string | null }>
  error?: string
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

        <section className="tile s12" aria-labelledby="test-receive-qr">
          <div className="tile-head">
            <div>
              <h2 className="tile-title" id="test-receive-qr">Send fake money to a receive QR</h2>
              <p className="body-s muted" style={{ margin: "4px 0 0" }}>
                Simulates a customer scan, records the local payment, then attempts the real mock-token mint on Arc testnet.
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
              {receiveResult.collection?.mintExplorer ? <a href={receiveResult.collection.mintExplorer} target="_blank" rel="noreferrer" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>View mint on Arc explorer</a> : null}
            </div>
          ) : null}
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
