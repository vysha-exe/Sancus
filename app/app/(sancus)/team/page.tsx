"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { people } from "@/lib/sancus/demo-data"
import { ROLE_LABEL, type Role } from "@/lib/sancus/companies"
import type { MemberDto } from "@/lib/sancus/members"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { TeamInviteSheet } from "@/components/sancus-ui/team-invite-sheet"
import { AccountsManager } from "@/components/sancus-ui/accounts-manager"

type MembersResponse = {
  companyId: string
  role: Role
  can: { invite: boolean }
  members: MemberDto[]
  inviteRoles: Role[]
}

type CompanyMe = {
  tree: { id: string; name: string; children: CompanyMe["tree"] }[]
  nodeCount: number
}

function flatten(nodes: CompanyMe["tree"], out: { id: string; name: string }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name })
    flatten(n.children, out)
  }
  return out
}

function initials(emailOrName: string): string {
  const base = emailOrName.split("@")[0] ?? emailOrName
  const parts = base.replace(/[._-]+/g, " ").trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function TeamPage() {
  const ws = useWorkspace()
  const [mode, setMode] = useState<"loading" | "live" | "demo">("loading")
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [data, setData] = useState<MembersResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("Role")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)

  const loadCompanies = useCallback(async () => {
    const res = await fetch("/api/sancus/companies/me", { cache: "no-store" })
    if (res.status === 401) {
      setMode("demo")
      return null
    }
    if (!res.ok) {
      setMode("demo")
      return null
    }
    const body = (await res.json()) as CompanyMe
    const list = flatten(body.tree ?? [])
    setCompanies(list)
    const preferred = ws.companyId
    const id = (preferred && list.some((c) => c.id === preferred) ? preferred : list[0]?.id) ?? null
    setCompanyId(id)
    return id
  }, [ws.companyId])

  const loadMembers = useCallback(async (id: string) => {
    const res = await fetch(`/api/sancus/companies/${id}/members`, { cache: "no-store" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "Could not load team")
      setMode("live")
      return
    }
    const body = (await res.json()) as MembersResponse
    setData(body)
    setError(null)
    setMode("live")
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = await loadCompanies()
        if (cancelled) return
        if (!id) return
        await loadMembers(id)
      } catch {
        if (!cancelled) setMode("demo")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadCompanies, loadMembers])

  async function onSelectCompany(id: string) {
    setCompanyId(id)
    ws.selectCompany(id)
    setMode("loading")
    await loadMembers(id)
  }

  const liveRows = useMemo(() => {
    const members = data?.members ?? []
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      const label = (m.email ?? m.userId ?? "").toLowerCase()
      if (q && !label.includes(q) && !ROLE_LABEL[m.role].toLowerCase().includes(q)) return false
      if (roleFilter !== "Role" && ROLE_LABEL[m.role] !== roleFilter) return false
      return true
    })
  }, [data, query, roleFilter])

  const demoRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (roleFilter !== "Role" && p.role !== roleFilter) return false
      return true
    })
  }, [query, roleFilter])

  const roleOptions = ["Role", "Owner", "Admin", "Finance", "Employee", "Viewer"]
  const companyName = companies.find((c) => c.id === companyId)?.name ?? "this branch"
  const isViewer = data?.role === "VIEWER"

  if (mode === "demo") {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="sx-h heading-2">Team</h1>
            <p className="body-s muted" style={{ margin: 0 }}>
              Demo people for Café Paulista. Create a global account under Branches to manage a live team.
            </p>
          </div>
          <Link href="/branches" className="sx-btn sx-btn--primary">
            Open Branches
          </Link>
        </header>
        <DemoTable rows={demoRows} query={query} setQuery={setQuery} roleFilter={roleFilter} setRoleFilter={setRoleFilter} roleOptions={roleOptions} />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Team</h1>
          {ws.activeNode ? (
            <span className="scope">
              {ws.activeNode.name}
              {ws.activeNode.children.length ? " and below" : ""}
            </span>
          ) : (
            <p className="body-s muted" style={{ margin: 0 }}>
              Who can spend, how much, and who signs off.
            </p>
          )}
        </div>
        {data?.can.invite ? (
          <button type="button" className="sx-btn sx-btn--primary" onClick={() => setInviteOpen(true)}>
            Invite someone
          </button>
        ) : null}
      </header>

      {isViewer ? (
        <div className="banner" role="status">
          <span>You can see this, not change it. Ask an Owner for a different role.</span>
        </div>
      ) : null}

      {companies.length > 1 ? (
        <label className="sx-field" style={{ maxWidth: 320, marginBottom: 16 }}>
          <span className="sx-label">Branch</span>
          <select className="sx-field__input" value={companyId ?? ""} onChange={(e) => void onSelectCompany(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {inviteMsg ? (
        <p className="body-s" role="status" style={{ marginBottom: 12 }}>
          {inviteMsg}
        </p>
      ) : null}
      {error ? (
        <div className="banner banner--err" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid">
        {/* Login accounts for branch admins and employees (hidden for accounts that can't manage people). */}
        <AccountsManager />

        <section className="tile s12" aria-label="People">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>
                    <label className="th-search">
                      <span className="vh">Search people</span>
                      <input placeholder="Name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </label>
                  </th>
                  <th>
                    <label className="th-filter">
                      <span className="vh">Filter by role</span>
                      <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                        {roleOptions.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <Chevron />
                    </label>
                  </th>
                  <th>Status</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {mode === "loading" ? (
                  <tr>
                    <td colSpan={4} className="body-s muted">
                      Loading team…
                    </td>
                  </tr>
                ) : liveRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="body-s muted">
                      Nobody matches those filters. Invite someone to this branch.
                    </td>
                  </tr>
                ) : (
                  liveRows.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link
                          href={`/team/${m.id}`}
                          style={{ display: "flex", gap: 10, alignItems: "center", color: "inherit", textDecoration: "none" }}
                        >
                          <span className="av">{initials(m.email ?? m.userId ?? "?")}</span>
                          <b>{m.email ?? m.userId ?? "Member"}</b>
                        </Link>
                      </td>
                      <td>
                        {ROLE_LABEL[m.role]}
                        {m.roleInherited ? <span className="body-s muted"> · Inherited</span> : null}
                      </td>
                      <td>
                        {m.status === "INVITED" ? (
                          <span className="sx-pill sx-pill--pending">Invited</span>
                        ) : (
                          <span className="sx-pill sx-pill--settled">Active</span>
                        )}
                      </td>
                      <td className="body-s muted">{m.roleInherited ? "From a parent branch" : "Set on this branch"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {liveRows.length} {liveRows.length === 1 ? "person" : "people"}
              {data ? ` · you are ${ROLE_LABEL[data.role]}` : ""}
            </span>
          </div>
        </section>

        <section className="tile s8" aria-labelledby="roles">
          <h2 className="tile-title" id="roles">
            What each role can do
          </h2>
          <table className="matrix">
            <thead>
              <tr>
                <th>Role</th>
                <th>Pay</th>
                <th>Approve</th>
                <th>Rules</th>
                <th>Invite</th>
                <th>Branches</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Owner</b>
                </td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Add</td>
              </tr>
              <tr>
                <td>
                  <b>Admin</b>
                </td>
                <td>In limits</td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Not Owner</td>
                <td>Add</td>
              </tr>
              <tr>
                <td>
                  <b>Finance</b>
                </td>
                <td>In limits</td>
                <td>Yes</td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td className="no">—</td>
              </tr>
              <tr>
                <td>
                  <b>Employee</b>
                </td>
                <td>In limits</td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td className="no">—</td>
              </tr>
              <tr>
                <td>
                  <b>Viewer</b>
                </td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td className="no">—</td>
                <td>View</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="tile s4" aria-labelledby="inv">
          <h2 className="tile-title" id="inv">
            Waiting to join
          </h2>
          {(data?.members.filter((m) => m.status === "INVITED") ?? []).map((m) => (
            <div className="kv" key={m.id}>
              <span>
                {m.email} · {ROLE_LABEL[m.role]}
              </span>
              <span>Pending</span>
            </div>
          ))}
          {(data?.members.filter((m) => m.status === "INVITED").length ?? 0) === 0 ? (
            <span className="body-s muted">No open invites.</span>
          ) : null}
        </section>
      </div>

      {companyId && data?.can.invite ? (
        <TeamInviteSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          companyId={companyId}
          companyName={companyName}
          inviteRoles={data.inviteRoles}
          localCurrency={ws.activeNode?.currency ?? "BRL"}
          onSent={(acceptPath) => {
            setInviteMsg(acceptPath ? `Invite sent. Accept path: ${acceptPath}` : "Invite sent.")
            void loadMembers(companyId)
          }}
        />
      ) : null}
    </div>
  )
}

function DemoTable({
  rows,
  query,
  setQuery,
  roleFilter,
  setRoleFilter,
  roleOptions,
}: {
  rows: typeof people
  query: string
  setQuery: (v: string) => void
  roleFilter: string
  setRoleFilter: (v: string) => void
  roleOptions: string[]
}) {
  return (
    <section className="tile s12" aria-label="People">
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>
                <label className="th-search">
                  <span className="vh">Search</span>
                  <input placeholder="Name" value={query} onChange={(e) => setQuery(e.target.value)} />
                </label>
              </th>
              <th>
                <label className="th-filter">
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    {roleOptions.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <Chevron />
                </label>
              </th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={p.id === "ana" ? "/team/ana" : "/team"} style={{ color: "inherit", textDecoration: "none" }}>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="av">{p.initials}</span>
                      <b>{p.name}</b>
                    </span>
                  </Link>
                </td>
                <td>{p.role}</td>
                <td>{p.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
