"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ROLE_LABEL, type CompanyNode, type Role } from "@/lib/sancus/companies"
import type { MemberDto } from "@/lib/sancus/members"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { TeamInviteSheet } from "@/components/sancus-ui/team-invite-sheet"
import { AccountsManager } from "@/components/sancus-ui/accounts-manager"
import { can, useAccount } from "@/lib/sancus/use-account"

type MembersResponse = {
  companyId: string
  role: Role
  can: { invite: boolean }
  members: MemberDto[]
  inviteRoles: Role[]
}

function flatten(nodes: { id: string; name: string; children: CompanyNode[] }[], out: { id: string; name: string }[] = []) {
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
  const accountState = useAccount()
  const [mode, setMode] = useState<"loading" | "live">("loading")
  const [companyId, setCompanyId] = useState<string | null>(null)
  const companies = useMemo(() => flatten(ws.tree), [ws.tree])
  const [data, setData] = useState<MembersResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("Role")
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [issueMemberId, setIssueMemberId] = useState("")

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
    if (!ws.ready || !accountState.ready) return
    let cancelled = false
    ;(async () => {
      if (accountState.signedOut) {
        // No guest demo team — sign in to manage a live roster.
        if (!cancelled) {
          setData(null)
          setMode("live")
        }
        return
      }
      try {
        const id = (ws.companyId && companies.some((company) => company.id === ws.companyId) ? ws.companyId : companies[0]?.id) ?? null
        if (cancelled) return
        setCompanyId(id)
        if (!id) {
          setMode("live")
          return
        }
        await loadMembers(id)
      } catch {
        if (!cancelled) {
          setError("Could not reach the server")
          setMode("live")
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accountState.ready, accountState.signedOut, companies, loadMembers, ws.companyId, ws.ready])

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

  const eligibleCardholders = useMemo(
    () => (data?.members ?? []).filter(
      (member) => member.status === "ACTIVE" && Boolean(member.userId) && (member.role === "EMPLOYEE" || member.role === "FINANCE")
    ),
    [data]
  )

  useEffect(() => {
    setIssueMemberId((current) => eligibleCardholders.some((member) => member.id === current) ? current : eligibleCardholders[0]?.id ?? "")
  }, [eligibleCardholders])

  const roleOptions = ["Role", "Owner", "Admin", "Finance", "Employee", "Viewer"]
  const companyName = companies.find((c) => c.id === companyId)?.name ?? "this branch"
  const isViewer = data?.role === "VIEWER"

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
        {can(accountState.account, "spending.manage") ? (
          <section className="tile s12" aria-labelledby="issue-card-title">
            <div className="tile-head">
              <div>
                <h2 className="tile-title" id="issue-card-title">Issue a card</h2>
                <span className="body-s muted">Choose an active employee in {companyName}, then set their card and limit.</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
              <label className="sx-field" style={{ flex: "1 1 320px", margin: 0 }}>
                <span className="sx-label">Employee</span>
                <select className="sx-field__input" value={issueMemberId} onChange={(event) => setIssueMemberId(event.target.value)} disabled={!eligibleCardholders.length}>
                  {!eligibleCardholders.length ? <option value="">No eligible employees</option> : null}
                  {eligibleCardholders.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.email ?? member.userId} · {ROLE_LABEL[member.role]}{member.roleInherited ? " · inherited" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {issueMemberId && companyId ? (
                <Link href={`/team/${issueMemberId}/methods/new?kind=card&companyId=${companyId}`} className="sx-btn sx-btn--primary">Continue</Link>
              ) : (
                <button type="button" className="sx-btn sx-btn--primary" disabled>Continue</button>
              )}
            </div>
            {!eligibleCardholders.length ? (
              <p className="body-s muted" style={{ margin: "12px 0 0" }}>Invite an employee and have them accept before issuing a card.</p>
            ) : null}
          </section>
        ) : null}

        {/* Login accounts for branch admins and employees (hidden for accounts that can't manage people). */}
        <AccountsManager scopeCompanyId={companyId} />

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
            setInviteMsg(
              acceptPath
                ? `Invite sent. Share this accept path: ${acceptPath}`
                : "Invite sent, but no accept link came back from the server. Check Team for pending invites."
            )
            void loadMembers(companyId)
          }}
        />
      ) : null}
    </div>
  )
}
