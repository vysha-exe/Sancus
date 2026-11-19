"use client"

// Branch admin dashboard: your branch's operating bank account, cross-border wallet, sub-branches, and
// the people you manage. Branch admins never see the global account or other branches.
import Link from "next/link"
import { AccountsManager } from "@/components/sancus-ui/accounts-manager"
import { findNode, type CompanyNode } from "@/lib/sancus/companies"
import { countryByCode } from "@/lib/sancus/countries"
import { useAccount } from "@/lib/sancus/use-account"
import { useWorkspace } from "@/lib/sancus/use-workspace"

const money = (minor: string, currency: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency,
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: ["IDR", "JPY", "KRW", "VND"].includes(currency) ? 0 : 2,
  maximumFractionDigits: ["IDR", "JPY", "KRW", "VND"].includes(currency) ? 0 : 2,
}).format(Number(BigInt(minor)) / 100)

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
              <span className="amount-xl">{ws.balancesReady && branch.bankBalance ? money(branch.bankBalance.balanceMinor, branch.bankBalance.currency) : "***"}</span>
              <span className="body-s muted">Available in {branch.bankBalance?.bankName ?? "the local operating bank"}</span>
              <div className="kv">
                <span>Cross-border wallet liquidity</span>
                <span>{usd(branch.ownMinor)}</span>
              </div>
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
            Customers pay by {branch?.country === "ID" ? "QRIS" : branch?.country === "BR" ? "Pix" : "PromptPay"}; the money settles into this branch&apos;s operating bank account.
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
