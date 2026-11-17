"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { people } from "@/lib/sancus/demo-data"

type Extra = {
  roleNote?: string
  spendsWith: string[]
  spendsNote?: string
  perPayment: string
  budget: string
  approvedBy: string
}

/** Team columns the shared demo data does not carry. */
const extras: Record<string, Extra> = {
  maya: {
    spendsWith: [],
    spendsNote: "Pays from the account",
    perPayment: "No limit",
    budget: "—",
    approvedBy: "—",
  },
  rafael: {
    roleNote: "approver",
    spendsWith: ["Card 7310"],
    spendsNote: "frozen",
    perPayment: "$5,000.00",
    budget: "R$ 0 of R$ 100.000",
    approvedBy: "Maya, above $5,000",
  },
  ana: {
    spendsWith: ["Card 4021", "Pix QR"],
    perPayment: "$500.00",
    budget: "R$ 595 of R$ 8.000",
    approvedBy: "Rafael or Maya",
  },
  arya: {
    spendsWith: ["QRIS"],
    perPayment: "$200.00",
    budget: "Rp 0 of Rp 3.200.000",
    approvedBy: "Rafael or Maya",
  },
  nida: {
    spendsWith: ["PromptPay"],
    perPayment: "$250.00",
    budget: "฿0 of ฿8,500",
    approvedBy: "Rafael or Maya",
  },
  joao: {
    roleNote: "accountant",
    spendsWith: [],
    spendsNote: "Can't spend",
    perPayment: "—",
    budget: "—",
    approvedBy: "—",
  },
}

const roles = ["Role", "Owner", "Finance", "Employee", "Viewer"]
const countries = ["Country", "Brazil", "Indonesia", "Thailand"]

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function TeamPage() {
  const [query, setQuery] = useState("")
  const [role, setRole] = useState("Role")
  const [country, setCountry] = useState("Country")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (role !== "Role" && p.role !== role) return false
      if (country !== "Country" && p.country !== country) return false
      return true
    })
  }, [query, role, country])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Team</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Who can spend, how much, and who signs off. Limits are enforced by your
            account&apos;s code, so nobody can go around them, us included.
          </p>
        </div>
        <button type="button" className="sx-btn sx-btn--primary">
          Invite someone
        </button>
      </header>

      <div className="grid">
        <section className="tile s12" aria-label="People">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>
                    <label className="th-search">
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <span className="vh">Search people</span>
                      <input placeholder="Name" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </label>
                  </th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by role</span>
                      <select value={role} onChange={(e) => setRole(e.target.value)}>
                        {roles.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <Chevron />
                    </label>
                  </th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by country</span>
                      <select value={country} onChange={(e) => setCountry(e.target.value)}>
                        {countries.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <Chevron />
                    </label>
                  </th>
                  <th>Spends with</th>
                  <th className="num">Per payment · USD</th>
                  <th className="num">Monthly budget · local</th>
                  <th>Approved by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const x = extras[p.id]
                  const identity = (
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="av">{p.initials}</span>
                      <b>{p.id === "maya" ? "Maya" : p.name}</b>
                    </span>
                  )
                  return (
                    <tr key={p.id} className={p.id === "ana" ? "on" : undefined}>
                      <td>
                        {p.id === "ana" ? (
                          <Link href="/team/ana" style={{ color: "inherit", textDecoration: "none" }}>
                            {identity}
                          </Link>
                        ) : (
                          identity
                        )}
                      </td>
                      <td>
                        {p.role}
                        {x?.roleNote ? ` · ${x.roleNote}` : ""}
                      </td>
                      <td>{p.country}</td>
                      <td>
                        {x && x.spendsWith.length > 0 ? (
                          <span className="pills" style={{ justifyContent: "flex-start" }}>
                            {x.spendsWith.map((m) => (
                              <span key={m} className="sx-rail">
                                {m}
                              </span>
                            ))}
                            {x.spendsNote ? <span className="body-s muted">{x.spendsNote}</span> : null}
                          </span>
                        ) : (
                          <span className="body-s muted">{x?.spendsNote ?? "—"}</span>
                        )}
                      </td>
                      <td className="num">{x?.perPayment ?? "—"}</td>
                      <td className="num">{x?.budget ?? "—"}</td>
                      <td>
                        {p.status === "Invited" ? (
                          <span className="sx-pill sx-pill--pending">Invited</span>
                        ) : (
                          (x?.approvedBy ?? "—")
                        )}
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="body-s muted">
                      Nobody matches those filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {rows.length} {rows.length === 1 ? "person" : "people"} · open Ana&apos;s name to see a
              profile
            </span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="roles">
          <h2 className="tile-title" id="roles">
            What each role can do
          </h2>
          <div className="kv">
            <span>Owner</span>
            <span>Everything</span>
          </div>
          <div className="kv">
            <span>Finance</span>
            <span>Pay, approve</span>
          </div>
          <div className="kv">
            <span>Employee</span>
            <span>Spend in limits</span>
          </div>
          <div className="kv">
            <span>Viewer</span>
            <span>See and export</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="inv">
          <h2 className="tile-title" id="inv">
            Waiting to join
          </h2>
          <div className="kv">
            <span>João Pereira · Viewer</span>
            <span>Sent Nov 14</span>
          </div>
          <div className="tile-foot">
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
              Resend
            </button>
            <button type="button" className="sx-btn sx-btn--quiet">
              Cancel invite
            </button>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="rules">
          <h2 className="tile-title" id="rules">
            Account rules
          </h2>
          <span className="body-s">
            Payments of $1,000 or more need an approver. First payments to new recipients always do.
          </span>
          <div className="tile-foot">
            <Link href="/settings" className="sx-btn sx-btn--quiet">
              Change in Settings
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
