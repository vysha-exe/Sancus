"use client"

// Branch admin dashboard: your branch's wallet (USDC and local stablecoins), your sub-branches, and
// the people you manage. Branch admins never see the global account or other branches.
import Link from "next/link"
import { AccountsManager } from "@/components/sancus-ui/accounts-manager"
import { findNode, type CompanyNode } from "@/lib/sancus/companies"
import { countryByCode } from "@/lib/sancus/countries"
import { useAccount } from "@/lib/sancus/use-account"
import { useWorkspace } from "@/lib/sancus/use-workspace"

const usd = (minor: string) => `$${(Number(minor) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function count(nodes: CompanyNode[]): number {
  return nodes.reduce((n, x) => n + 1 + count(x.children), 0)
}

export default function BranchPage() {
  const { account } = useAccount()
  const ws = useWorkspace()

  // The branch this login runs (the visible tree's top node for a branch admin).
  const runs = account?.scopes.find((s) => !s.isRoot && (s.role === "ADMIN" || s.role === "OWNER"))
  const branch = (runs?.companyId ? findNode(ws.tree, runs.companyId) : null) ?? ws.tree[0] ?? null
  const country = branch ? countryByCode(branch.country) : undefined
  const local = branch?.wallets.flatMap((w) => Object.entries(w.local ?? {})) ?? []

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sx-label">Branch admin</span>
          <h1 className="sx-h heading-2">{branch ? `${country?.flag ?? ""} ${branch.name}` : "Your branch"}</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            You manage this branch and its people. The global account and other branches are run by your company&apos;s admin.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s4" aria-labelledby="bal">
          <h2 className="tile-title" id="bal">
            Branch balance
          </h2>
          {!ws.ready || !branch ? (
            <div className="empty">Loading…</div>
          ) : (
            <>
              <span className="amount-xl">{ws.balancesReady ? usd(branch.totalMinor) : "***"}</span>
              <span className="body-s muted">USDC across {branch.wallets.length} wallet{branch.wallets.length === 1 ? "" : "s"}{branch.children.length ? " and sub-branches" : ""}</span>
              {local.map(([cur, minor]) => (
                <div className="kv" key={cur}>
                  <span>Local stablecoin</span>
                  <span>
                    {(Number(minor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} m{cur}
                  </span>
                </div>
              ))}
            </>
          )}
        </section>

        <section className="tile s4" aria-labelledby="struct">
          <h2 className="tile-title" id="struct">
            Structure
          </h2>
          <div className="kv">
            <span>Sub-branches</span>
            <span className="body-strong">{branch ? count(branch.children) : "–"}</span>
          </div>
          <div className="kv">
            <span>Country</span>
            <span>{country ? `${country.name} · ${country.currency}` : "–"}</span>
          </div>
          <div className="tile-foot">
            <Link href="/branches" className="sx-btn sx-btn--quiet">
              See the branch tree
            </Link>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="collect">
          <h2 className="tile-title" id="collect">
            Get paid locally
          </h2>
          <p className="body-s muted" style={{ margin: 0 }}>
            Customers pay by {branch?.country === "ID" ? "QRIS" : branch?.country === "BR" ? "Pix" : "PromptPay"}; the money lands in this branch&apos;s wallet.
          </p>
          <div className="tile-foot">
            <Link href="/receive" className="sx-btn sx-btn--secondary">
              Collect a payment
            </Link>
          </div>
        </section>

        <AccountsManager title="Your people" />
      </div>
    </div>
  )
}
