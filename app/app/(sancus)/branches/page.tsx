"use client"

// Sancus: one global treasury → direct country branches with operating accounts and cross-border wallets.
import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ROLE_LABEL, type CompanyNode } from "@/lib/sancus/companies"
import { COUNTRIES, countryByCode } from "@/lib/sancus/countries"
import { CompanyTreeDiagram } from "@/components/sancus-ui/company-tree-diagram"
import { OrgChart } from "@/components/sancus-ui/org-chart"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { useAccount } from "@/lib/sancus/use-account"
import { useCompanies } from "@/lib/sancus/use-companies"

const usd = (minor: string) => `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)}`
const primaryBalance = (node: CompanyNode) => {
  if (node.parentId === null) return usd(node.ownMinor)
  const currency = node.bankBalance?.currency ?? node.currency
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2 })
    .format(Number(node.bankBalance?.balanceMinor ?? "0") / 100)
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const flag = (code: string) => countryByCode(code)?.flag ?? "🏳️"

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    return { ok: res.ok, data: await res.json() }
  } catch {
    return { ok: false, data: { error: "Could not reach the server" } }
  }
}

export default function BranchesPage() {
  const ws = useWorkspace()
  const companiesData = useCompanies()
  const accountState = useAccount()
  const mode = !ws.ready || !accountState.ready ? "loading" : "live"

  const tree = ws.tree
  const nodes = tree.reduce((sum, root) => sum + root.children.length, 0)
  const walletCount = companiesData.walletCount
  const balancesReady = companiesData.balancesReady

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Branches</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Every country branch has a local operating bank account and separate wallet liquidity for cross-border movement.
          </p>
        </div>
        {mode === "live" ? <span className="sx-pill sx-pill--settled">Live</span> : null}
      </header>

      <div className="grid">
        <div className="tile s4">
          <span className="sx-label">Operating accounts</span>
          <span className="big">{balancesReady ? nodes : "***"}</span>
        </div>
        <div className="tile s4">
          <span className="sx-label">Branches</span>
          <span className="big">{nodes}</span>
        </div>
        <div className="tile s4">
          <span className="sx-label">Wallets</span>
          <span className="big">{walletCount}</span>
        </div>

        {mode === "loading" ? (
          <div className="tile s12">
            <span className="body-s muted">Loading your branches…</span>
          </div>
        ) : tree.length === 0 && mode === "live" ? (
          <section className="tile s12" aria-labelledby="empty-biz">
            <span className="state-cap">Branches · no company yet</span>
            <div className="empty" style={{ minHeight: 180 }}>
              <b style={{ color: "var(--ink)" }} id="empty-biz">
                No business yet
              </b>
              <span>Open one to add a team and branches.</span>
            </div>
            <CreateGlobalAccount
              circleConfigured={companiesData.circleConfigured}
              onCreated={ws.refresh}
            />
          </section>
        ) : tree.length === 0 ? (
          <CreateGlobalAccount
            circleConfigured={companiesData.circleConfigured}
            onCreated={ws.refresh}
          />
        ) : (
          <>
          <section className="tile s12" aria-labelledby="structure">
            <div className="tile-head">
              <h2 className="tile-title" id="structure">
                Company structure
              </h2>
              <span className="body-s muted">Select an account to open its treasury, payments, team, and transfers</span>
            </div>
            <CompanyTreeDiagram tree={tree} balancesReady={balancesReady} />
          </section>
          {mode === "live" ? (
            <section className="tile s12" aria-labelledby="org">
              <div className="tile-head">
                <h2 className="tile-title" id="org">
                  Who works where
                </h2>
                <span className="body-s muted">Every branch and the people in it, with their spending limits</span>
              </div>
              <OrgChart />
            </section>
          ) : null}
          {tree.map((root) => (
            <section key={root.id} className="tile s12" aria-label={root.name} style={{ gap: 12 }}>
              <BranchNode node={root} live={mode === "live"} balancesReady={balancesReady} onChanged={ws.refresh} />
            </section>
          ))}
          </>
        )}
      </div>
    </div>
  )
}

function CreateGlobalAccount({ circleConfigured, onCreated }: { circleConfigured: boolean; onCreated: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const r = await postJson("/api/sancus/companies", { name: f.get("name"), country: "US" })
    setBusy(false)
    if (!r.ok) return setError(String(r.data.error ?? "Could not create the account"))
    const company = r.data.company as { id?: string } | undefined
    if (company?.id) {
      const { setWorkspaceCompany } = await import("@/lib/sancus/workspace")
      setWorkspaceCompany(company.id)
    }
    if (r.data.walletError) setError(`Account created, but the wallet wasn't: ${r.data.walletError}`)
    onCreated()
  }

  return (
    <section className="tile s12" aria-labelledby="create-global">
      <h2 className="tile-title" id="create-global">
        Create your global account
      </h2>
      <p className="body-s muted" style={{ margin: 0, maxWidth: "62ch" }}>
        This is your country-neutral global treasury. You&apos;ll be its Owner, and each country is added beneath it as a branch.
      </p>
      {!circleConfigured ? (
        <p className="body-s" style={{ margin: 0 }}>
          Circle isn&apos;t connected, so the account will be created without a wallet. Add your Circle keys to create
          wallets.
        </p>
      ) : null}
      <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
        <label className="sx-field" style={{ gridColumn: "span 12" }}>
          <span className="sx-label">Company name</span>
          <input name="name" className="sx-field__input" placeholder="Lion City Trading" required maxLength={120} />
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

function BranchNode({
  node,
  live,
  balancesReady,
  onChanged,
}: {
  node: CompanyNode
  live: boolean
  balancesReady: boolean
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const isRoot = node.parentId === null || node.depth === 0
  const canAdd = live && isRoot && node.can.createBranch
  const viewOnlyParent = live && !node.can.createBranch && node.role === "VIEWER"

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
        {isRoot ? null : <span style={{ fontSize: 22 }} aria-hidden>{flag(node.country)}</span>}
        <div style={{ display: "grid", minWidth: 0, flex: 1 }}>
          <h2 className={`sx-h ${isRoot ? "heading-3" : "body-strong"} trunc`} style={{ margin: 0 }}>
            <Link href={`/branches/${node.id}`} style={{ color: "inherit", textDecoration: "none" }}>{node.name}</Link>
          </h2>
          <span className="body-s muted">
            {isRoot ? "Global treasury · USDC" : `Branch · ${countryByCode(node.country)?.name ?? node.country} · ${node.currency}`}
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
          <div className="body-strong">{balancesReady ? primaryBalance(node) : "***"}</div>
          <div className="body-s muted">{isRoot ? "Wallet treasury" : "Available bank balance"}</div>
        </div>
      </div>

      {viewOnlyParent ? (
        <div className="banner">
          <span>You can see this, not change it. Ask an Owner for a different role.</span>
        </div>
      ) : null}

      {live && node.roleInherited && node.parentId && !node.can.createBranch && node.role && node.role !== "VIEWER" ? (
        <div className="banner">
          <span>
            You manage {node.name} and below. Parent branches are managed by their Owner and Admins.
          </span>
        </div>
      ) : null}

      {node.wallets.length ? (
        <div className="sx-rows">
          <span className="sx-label">Wallet liquidity · cross-border and on-chain only</span>
          {node.wallets.map((w) => (
            <div key={w.walletId} className="sx-row">
              <span className="sx-row__who">{w.name}</span>
              <span className="sx-row__amount">{!balancesReady ? "***" : w.usdcMinor === null ? "–" : usd(w.usdcMinor)}</span>
              <span className="sx-row__meta">
                <span className="sx-rail">USDC</span>{" "}
                {Object.entries(w.local ?? {}).map(([cur, minor]) => (
                  <span key={cur} className="sx-pill">
                    {(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} m{cur}
                  </span>
                ))}{" "}
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

      {canAdd ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="sx-btn sx-btn--secondary sx-btn--sm"
            onClick={() => setAdding(!adding)}
            aria-expanded={adding}
          >
            + Branch
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
        <div className="banner banner--err" role="alert">
          <span>{/depth|6 levels/i.test(error) ? "Branches stop at 6 levels. Add this one under a higher branch instead." : error}</span>
        </div>
      ) : null}

      {node.children.length ? (
        <div style={{ display: "grid", gap: 16, marginTop: 6, paddingLeft: 18, borderLeft: "2px solid var(--line)" }}>
          {node.children.map((child) => (
            <BranchNode key={child.id} node={child} live={live} balancesReady={balancesReady} onChanged={onChanged} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
