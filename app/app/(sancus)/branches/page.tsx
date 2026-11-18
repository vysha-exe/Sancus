"use client"

// Sancus: global account → branches → sub-branches, each with its own wallets.
import { useCallback, useEffect, useState, type FormEvent } from "react"
import {
  buildCompanyTree,
  ROLE_LABEL,
  type CompanyNode,
  type CompanyRow,
  type CompanyWallet,
} from "@/lib/sancus/companies"
import { COUNTRIES, countryByCode } from "@/lib/sancus/countries"
import { CompanyTreeDiagram } from "@/components/sancus-ui/company-tree-diagram"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"

type Me = { circleConfigured: boolean; tree: CompanyNode[]; nodeCount: number; walletCount: number }

const usd = (minor: string) => `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)}`
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const flag = (code: string) => countryByCode(code)?.flag ?? "🏳️"

// Shown when signed out (mock UI mode).
const demoTree: CompanyNode[] = (() => {
  const t = (n: number) => `2026-11-18T00:00:0${n}Z`
  const rows: CompanyRow[] = [
    { id: "hq", parent_id: null, root_id: "hq", name: "Lion City Trading (Global)", country: "SG", base_currency: "SGD", created_at: t(0) },
    { id: "id", parent_id: "hq", root_id: "hq", name: "Indonesia", country: "ID", base_currency: "IDR", created_at: t(1) },
    { id: "jkt", parent_id: "id", root_id: "hq", name: "Jakarta warehouse", country: "ID", base_currency: "IDR", created_at: t(2) },
    { id: "th", parent_id: "hq", root_id: "hq", name: "Thailand", country: "TH", base_currency: "THB", created_at: t(3) },
  ]
  const w = (companyId: string, name: string, usdc: string): CompanyWallet => ({
    walletId: `${companyId}-${name}`,
    name,
    address: "0x4F2a00000000000000000000000000000000c81E",
    blockchain: "ARC-TESTNET",
    companyId,
    usdcMinor: usdc,
  })
  return buildCompanyTree(
    rows,
    [{ company_id: "hq", user_id: "demo", role: "OWNER", status: "ACTIVE" }],
    [w("hq", "Global treasury", "6390340000"), w("id", "Indonesia treasury", "1200000000"), w("jkt", "Jakarta payroll", "350000000"), w("th", "Thailand treasury", "800000000")],
    "demo"
  )
})()

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return { ok: res.ok, data: await res.json() }
  } catch {
    return { ok: false, data: { error: "Could not reach the server" } }
  }
}

export default function BranchesPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [mode, setMode] = useState<"loading" | "live" | "demo">("loading")
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      let res = await fetch("/api/sancus/companies/me", { cache: "no-store" })
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 1200))
        res = await fetch("/api/sancus/companies/me", { cache: "no-store" })
      }
      if (res.status === 401) return setMode("demo")
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Could not load branches")
        return setMode("live")
      }
      setMe(body as Me)
      setError(null)
      setMode("live")
    } catch {
      setMode("demo")
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/sancus/companies/me", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 401) return load() // retry once after demo auto-login
        const body = await res.json()
        if (res.ok) {
          setMe(body as Me)
          setMode("live")
        } else {
          setError(body.error ?? "Could not load branches")
          setMode("live")
        }
      })
      .catch(() => !cancelled && setMode("demo"))
    return () => {
      cancelled = true
    }
  }, [load])

  const tree = mode === "demo" ? demoTree : (me?.tree ?? [])
  const total = tree.reduce((s, n) => s + BigInt(n.totalMinor), 0n)
  const nodes = mode === "demo" ? 4 : (me?.nodeCount ?? 0)
  const walletCount = mode === "demo" ? 4 : (me?.walletCount ?? 0)

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Branches</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            One global account, with a branch for each country and sub-branches under them. Every branch keeps its own
            wallets and balance.
          </p>
        </div>
        {mode === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
        {mode === "demo" ? <span className="sx-pill sx-pill--simulated">Demo data</span> : null}
      </header>

      <div className="grid">
        <div className="tile s4">
          <span className="sx-label">Across every branch</span>
          <span className="big">{usd(total.toString())}</span>
        </div>
        <div className="tile s4">
          <span className="sx-label">Branches</span>
          <span className="big">{nodes}</span>
        </div>
        <div className="tile s4">
          <span className="sx-label">Wallets</span>
          <span className="big">{walletCount}</span>
        </div>

        {error ? (
          <div className="tile s12" role="alert">
            <span className="body-s" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          </div>
        ) : null}

        {mode === "loading" ? (
          <div className="tile s12">
            <span className="body-s muted">Loading your branches…</span>
          </div>
        ) : tree.length === 0 ? (
          <CreateGlobalAccount circleConfigured={me?.circleConfigured ?? false} onCreated={load} />
        ) : (
          <>
          <section className="tile s12" aria-labelledby="structure">
            <div className="tile-head">
              <h2 className="tile-title" id="structure">
                Company structure
              </h2>
              <span className="body-s muted">Totals include sub-branches · tap a box to see its wallets</span>
            </div>
            <CompanyTreeDiagram tree={tree} />
          </section>
          {tree.map((root) => (
            <section key={root.id} className="tile s12" aria-label={root.name} style={{ gap: 12 }}>
              <BranchNode node={root} live={mode === "live"} onChanged={load} />
            </section>
          ))}
          </>
        )}
      </div>
    </div>
  )
}

function CreateGlobalAccount({ circleConfigured, onCreated }: { circleConfigured: boolean; onCreated: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const r = await postJson("/api/sancus/companies", { name: f.get("name"), country: f.get("country") })
    setBusy(false)
    if (!r.ok) return setError(String(r.data.error ?? "Could not create the account"))
    if (r.data.walletError) setError(`Account created, but the wallet wasn't: ${r.data.walletError}`)
    onCreated()
  }

  return (
    <section className="tile s12" aria-labelledby="create-global">
      <h2 className="tile-title" id="create-global">
        Create your global account
      </h2>
      <p className="body-s muted" style={{ margin: 0, maxWidth: "62ch" }}>
        This is the top of your company. You&apos;ll be its Owner, and you can add a branch for each country, then
        sub-branches under those. Each one gets its own wallet automatically.
      </p>
      {!circleConfigured ? (
        <p className="body-s" style={{ margin: 0 }}>
          Circle isn&apos;t connected, so the account will be created without a wallet. Add your Circle keys to create
          wallets.
        </p>
      ) : null}
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <label className="sx-field" style={{ gridColumn: "span 7" }}>
          <span className="sx-label">Company name</span>
          <input name="name" className="sx-field__input" placeholder="Lion City Trading" required maxLength={120} />
        </label>
        <label className="sx-field" style={{ gridColumn: "span 5" }}>
          <span className="sx-label">Headquarters</span>
          <CountrySelect name="country" defaultValue="SG" />
        </label>
        <div style={{ gridColumn: "span 12", display: "flex", gap: 12, alignItems: "center" }}>
          <button type="submit" className="sx-btn sx-btn--primary" disabled={busy}>
            {busy ? "Creating…" : "Create global account"}
          </button>
          {error ? (
            <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          ) : null}
        </div>
      </form>
    </section>
  )
}

function CountrySelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  return (
    <select name={name} className="sx-field__input" defaultValue={defaultValue}>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name} ({c.currency})
        </option>
      ))}
    </select>
  )
}

function BranchNode({ node, live, onChanged }: { node: CompanyNode; live: boolean; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const isRoot = node.parentId === null || node.depth === 0

  async function addBranch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    // The branch's wallet is created automatically with it.
    const r = await postJson(`/api/sancus/companies/${node.id}/branches`, { name: f.get("name"), country: f.get("country") })
    setBusy(false)
    if (!r.ok) return setError(String(r.data.error ?? "Could not add the branch"))
    if (r.data.walletError) setError(`Branch added, but its wallet wasn't: ${r.data.walletError}`)
    else setAdding(false)
    onChanged()
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

  return (
    <div id={`branch-${node.id}`} style={{ display: "grid", gap: 10, scrollMarginTop: 80 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: isRoot ? 28 : 22 }} aria-hidden>
          {flag(node.country)}
        </span>
        <div style={{ display: "grid", minWidth: 0, flex: 1 }}>
          <h2 className={`sx-h ${isRoot ? "heading-3" : "body-strong"} trunc`} style={{ margin: 0 }}>
            {node.name}
          </h2>
          <span className="body-s muted">
            {node.parentId === null ? "Global account" : node.depth <= 1 ? "Branch" : "Sub-branch"} · {countryByCode(node.country)?.name ?? node.country} ·{" "}
            {node.currency}
            {node.role ? (
              <>
                {" · "}
                {ROLE_LABEL[node.role]}
                {node.roleInherited ? " (inherited)" : ""}
              </>
            ) : null}
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="body-strong">{usd(node.ownMinor)}</div>
          {node.children.length ? (
            <div className="body-s muted">{usd(node.totalMinor)} with sub-branches</div>
          ) : null}
        </div>
      </div>

      {node.wallets.length ? (
        <div className="sx-rows">
          {node.wallets.map((w) => (
            <div key={w.walletId} className="sx-row">
              <span className="sx-row__who">{w.name}</span>
              <span className="sx-row__amount">{w.usdcMinor === null ? "–" : usd(w.usdcMinor)}</span>
              <span className="sx-row__meta">
                <span className="sx-rail">USDC</span>{" "}
                {live ? (
                  <a href={`https://explorer.testnet.arc.io/address/${w.address}`} target="_blank" rel="noreferrer" className="data">
                    {short(w.address)}
                  </a>
                ) : (
                  <span className="data">{short(w.address)}</span>
                )}
              </span>
              <span className="sx-row__status">
                {live ? (
                  <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => copy(w.address)}>
                    {copied === w.address ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <span className="body-s muted">No wallets yet.</span>
      )}

      {live && node.can.createBranch ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="sx-btn sx-btn--secondary sx-btn--sm"
            onClick={() => setAdding(!adding)}
            aria-expanded={adding}
          >
            + {isRoot ? "Branch" : "Sub-branch"}
          </button>
        </div>
      ) : null}

      {adding ? (
        <form onSubmit={addBranch} className="grid" style={{ gap: 8 }}>
          <label className="sx-field" style={{ gridColumn: "span 7" }}>
            <span className="sx-label">{isRoot ? "Branch" : "Sub-branch"} name</span>
            <input name="name" className="sx-field__input" placeholder={isRoot ? "Indonesia" : "Jakarta warehouse"} required maxLength={120} autoFocus />
          </label>
          <label className="sx-field" style={{ gridColumn: "span 5" }}>
            <span className="sx-label">Country</span>
            <CountrySelect name="country" defaultValue={node.country} />
          </label>
          <div style={{ gridColumn: "span 12", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="sx-btn sx-btn--primary" disabled={busy}>
              {busy ? "Creating…" : `Add ${isRoot ? "branch" : "sub-branch"}`}
            </button>
            <span className="body-s muted">Its wallet is created automatically.</span>
          </div>
        </form>
      ) : null}

      {error ? (
        <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
          {error}
        </span>
      ) : null}

      {node.children.length ? (
        <div style={{ display: "grid", gap: 16, marginTop: 6, paddingLeft: 18, borderLeft: "2px solid var(--line)" }}>
          {node.children.map((child) => (
            <BranchNode key={child.id} node={child} live={live} onChanged={onChanged} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
