"use client"

// Sancus: who works where. Global account → branches, with the people in each and their limits.
// Admins see the whole company; branch admins see their own branch.
import { useEffect, useState } from "react"
import { countryByCode } from "@/lib/sancus/countries"

type Company = { id: string; parentId: string | null; name: string; country: string }
type Person = {
  membershipId: string
  companyId: string
  name: string
  email: string | null
  role: string
  status: string
  perPaymentLimitMinor: string | null
  dailyLimitMinor: string | null
}

const ROLE: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", FINANCE: "Finance", EMPLOYEE: "Employee", VIEWER: "Viewer" }
const usd = (minor: string) => `$${(Number(minor) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("")

export function OrgChart() {
  const [data, setData] = useState<{ companies: Company[]; people: Person[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/sancus/accounts", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json()
        if (!alive) return
        if (!r.ok) setError(body.error ?? "Couldn't load people")
        else setData({ companies: body.companies ?? [], people: body.people ?? [] })
      })
      .catch(() => alive && setError("Couldn't load people"))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <span className="body-s muted">{error}</span>
  if (!data) return <div className="empty">Loading people…</div>
  if (!data.companies.length) return <span className="body-s muted">No one to show yet.</span>

  const ids = new Set(data.companies.map((c) => c.id))
  const tops = data.companies.filter((c) => !c.parentId || !ids.has(c.parentId))
  const kids = (id: string) => data.companies.filter((c) => c.parentId === id)
  const people = (id: string) =>
    data.people
      .filter((p) => p.companyId === id && p.status === "ACTIVE")
      .sort((a, b) => ["OWNER", "ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"].indexOf(a.role) - ["OWNER", "ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"].indexOf(b.role))

  function Node({ c, depth }: { c: Company; depth: number }) {
    const list = people(c.id)
    return (
      <div style={{ display: "grid", gap: 10, marginLeft: depth ? 20 : 0, paddingLeft: depth ? 14 : 0, borderLeft: depth ? "2px solid var(--sx-border, rgba(127,127,127,.25))" : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span aria-hidden>{countryByCode(c.country)?.flag ?? "🏳️"}</span>
          <span className="body-strong">{c.name}</span>
          <span className="body-s muted">{depth === 0 && !c.parentId ? "Global account" : `Branch · ${countryByCode(c.country)?.name ?? c.country}`}</span>
          <span className="body-s muted">· {list.length} {list.length === 1 ? "person" : "people"}</span>
        </div>
        {list.length ? (
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {list.map((p) => (
              <div
                key={p.membershipId}
                title={p.email ?? undefined}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--surface-100)", minWidth: 0 }}
              >
                <span className="av" style={{ flexShrink: 0 }}>{initials(p.name)}</span>
                <span style={{ display: "grid", minWidth: 0, flex: 1, justifyItems: "start" }}>
                  <span className="body-strong trunc">{p.name}</span>
                  <span className="body-s muted trunc">
                    {ROLE[p.role] ?? p.role}
                    {p.perPaymentLimitMinor ? ` · ${usd(p.perPaymentLimitMinor)}/payment` : ""}
                    {p.dailyLimitMinor ? ` · ${usd(p.dailyLimitMinor)}/day` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {kids(c.id).map((k) => (
          <Node key={k.id} c={k} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {tops.map((c) => (
        <Node key={c.id} c={c} depth={0} />
      ))}
    </div>
  )
}
