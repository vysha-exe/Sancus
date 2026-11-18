"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ROLE_LABEL, type Role } from "@/lib/sancus/companies"
import { getPerson } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { MemberDto } from "@/lib/sancus/members"
import { canAssignRole } from "@/lib/sancus/members"
import type { SancusCardDto } from "@/lib/sancus/cards"
import type { SpendingMethodDto } from "@/lib/sancus/local-rails"

type LivePayload = {
  member: MemberDto
  company: { id: string; name: string; country: string; currency: string }
  can: { invite: boolean }
  actorRole: Role
}

const ALL_ASSIGNABLE_ROLES: Role[] = ["OWNER", "ADMIN", "FINANCE", "EMPLOYEE", "VIEWER"]

const roleAccess: Record<string, { pay: string; approve: string }> = {
  Owner: { pay: "Yes, no limit", approve: "Yes" },
  OWNER: { pay: "Yes, no limit", approve: "Yes" },
  Finance: { pay: "Yes, in limits", approve: "Yes" },
  FINANCE: { pay: "Yes, in limits", approve: "Yes" },
  Employee: { pay: "Yes, in limits", approve: "No" },
  EMPLOYEE: { pay: "Yes, in limits", approve: "No" },
  Viewer: { pay: "No", approve: "No" },
  VIEWER: { pay: "No", approve: "No" },
  Admin: { pay: "Yes, in limits", approve: "Yes" },
  ADMIN: { pay: "Yes, in limits", approve: "Yes" },
}

function isUuid(id: string) {
  return /^[0-9a-f-]{36}$/i.test(id)
}

function initials(emailOrName: string): string {
  const base = emailOrName.split("@")[0] ?? emailOrName
  const parts = base.replace(/[._-]+/g, " ").trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase()
}

function usd(minor: string | null): string {
  if (!minor) return "No limit"
  return `$${displayMinor(BigInt(minor), USDC_DECIMALS, "", 2)}`
}

function formatMethodMoney(currency: string, minor: string) {
  const divisor = currency === "JPY" ? 1 : 100
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "JPY" ? 0 : 2,
  }).format(Number(minor) / divisor)
}

function memberMatchesEmployee(member: MemberDto, employeeId: string, employeeName: string): boolean {
  if (member.userId && employeeId === member.userId) return true
  if (employeeId === member.id) return true
  const email = (member.email ?? "").toLowerCase()
  const name = employeeName.toLowerCase()
  if (email && (name === email || name === email.split("@")[0])) return true
  if (member.userId && name === member.userId.toLowerCase()) return true
  return false
}

export default function EmployeePage() {
  const params = useParams<{ personId: string }>()
  const personId = params?.personId ?? ""
  const [live, setLive] = useState<LivePayload | null>(null)
  const [mode, setMode] = useState<"loading" | "live" | "demo" | "missing">("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [perPay, setPerPay] = useState("500")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [roleDraft, setRoleDraft] = useState<Role>("EMPLOYEE")
  const [methods, setMethods] = useState<SpendingMethodDto[]>([])
  const [cards, setCards] = useState<SancusCardDto[]>([])

  const loadMethods = useCallback(async (member: MemberDto) => {
    try {
      const [methodsRes, cardsRes] = await Promise.all([
        fetch("/api/sancus/spending-methods", { cache: "no-store" }),
        fetch("/api/sancus/cards", { cache: "no-store" }),
      ])
      const methodList: SpendingMethodDto[] = methodsRes.ok
        ? ((await methodsRes.json()) as { methods?: SpendingMethodDto[] }).methods ?? []
        : []
      const cardList: SancusCardDto[] = cardsRes.ok
        ? ((await cardsRes.json()) as { cards?: SancusCardDto[] }).cards ?? []
        : []
      setMethods(methodList.filter((m) => memberMatchesEmployee(member, m.employeeId, m.employeeName)))
      setCards(cardList.filter((c) => memberMatchesEmployee(member, c.employeeId, c.employeeName)))
    } catch {
      setMethods([])
      setCards([])
    }
  }, [])

  const load = useCallback(async () => {
    if (!isUuid(personId)) {
      setMode(getPerson(personId) ? "demo" : "missing")
      return
    }
    setLoadError(null)
    try {
      const res = await fetch(`/api/sancus/companies/members/${personId}`, { cache: "no-store" })
      if (res.status === 404) {
        setMode("missing")
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLoadError((body as { error?: string }).error ?? "Could not load this person")
        setMode("missing")
        return
      }
      const body = (await res.json()) as LivePayload
      setLive(body)
      setRoleDraft(body.member.role)
      if (body.member.perPaymentLimitMinor) {
        setPerPay(displayMinor(BigInt(body.member.perPaymentLimitMinor), USDC_DECIMALS, "", 2))
      }
      setMode("live")
      void loadMethods(body.member)
    } catch {
      setLoadError("Could not reach the server")
      setMode("missing")
    }
  }, [personId, loadMethods])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const assignableRoles = useMemo(() => {
    if (!live) return [] as Role[]
    return ALL_ASSIGNABLE_ROLES.filter((r) => canAssignRole(live.actorRole, r))
  }, [live])

  async function saveLimits() {
    if (!live) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/sancus/companies/members/${live.member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perPaymentLimitUsd: perPay }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMsg(body.error ?? "Could not save")
        return
      }
      setEditOpen(false)
      await load()
      setMsg("Limits saved")
    } catch {
      setMsg("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  async function saveRole(next: Role) {
    if (!live || next === live.member.role) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/sancus/companies/members/${live.member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMsg(body.error ?? "Could not change role")
        setRoleDraft(live.member.role)
        return
      }
      await load()
      setMsg("Role updated")
    } catch {
      setMsg("Could not reach the server")
      setRoleDraft(live.member.role)
    } finally {
      setBusy(false)
    }
  }

  async function toggleDisabled() {
    if (!live) return
    const next = live.member.status === "DISABLED" ? "ACTIVE" : "DISABLED"
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/sancus/companies/members/${live.member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json()
      if (!res.ok) {
        setMsg(body.error ?? "Could not update status")
        return
      }
      await load()
      setMsg(next === "DISABLED" ? "Access disabled" : "Access re-enabled")
    } catch {
      setMsg("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  if (mode === "loading") {
    return (
      <div className="page">
        <p className="body-s muted">Loading…</p>
      </div>
    )
  }

  if (mode === "missing") {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="sx-h heading-2">We couldn&apos;t find that person</h1>
            <p className="body-s muted" style={{ margin: 0 }}>
              {loadError ?? "They may have been removed, or the link is out of date."}
            </p>
          </div>
        </header>
        <Link href="/team" className="sx-btn sx-btn--primary">
          Back to Team
        </Link>
      </div>
    )
  }

  if (mode === "live" && live) {
    const m = live.member
    const name = m.email ?? m.userId ?? "Member"
    const roleLabel = ROLE_LABEL[m.role]
    const canSpend = m.role === "EMPLOYEE" || m.role === "FINANCE" || m.role === "ADMIN" || m.role === "OWNER"
    const access = roleAccess[m.role] ?? { pay: "No", approve: "No" }
    const isViewer = live.actorRole === "VIEWER"
    const canManage = live.can.invite && !isViewer

    return (
      <div className="page">
        <header className="page-head">
          <div>
            <nav aria-label="Breadcrumb" className="body-s muted">
              <Link href="/team">Team</Link> / {name}
            </nav>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span className="av av--lg">{initials(name)}</span>
              <div style={{ display: "grid", gap: 2 }}>
                <h1 className="sx-h heading-2">{name}</h1>
                <span className="body-s muted">
                  {roleLabel} · {live.company.name} · {live.company.country}
                  {m.status === "INVITED" ? " · Invited" : ""}
                  {m.status === "DISABLED" ? " · Disabled" : ""}
                </span>
              </div>
            </div>
          </div>
          {canSpend && live.can.invite ? (
            <Link href={`/team/${m.id}/methods/new`} className="sx-btn sx-btn--primary">
              Add a card or QR
            </Link>
          ) : null}
        </header>

        {isViewer ? (
          <div className="banner" role="status">
            <span>You can see this, not change it. Ask an Owner for a different role.</span>
          </div>
        ) : null}
        {msg ? (
          <p className="body-s" role="status">
            {msg}
          </p>
        ) : null}

        <div className="grid">
          <section className="tile s4" aria-labelledby="access">
            <h2 className="tile-title" id="access">
              Role and access
            </h2>
            {canManage ? (
              <div style={{ display: "grid", gap: 12 }}>
                <label className="sx-field">
                  <span className="sx-label">Role on this branch</span>
                  <select
                    className="sx-field__input"
                    value={roleDraft}
                    disabled={busy || m.roleInherited}
                    onChange={(e) => {
                      const next = e.target.value as Role
                      setRoleDraft(next)
                      void saveRole(next)
                    }}
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  {m.roleInherited ? (
                    <span className="sx-field__help">Inherited from a parent branch — change it on the branch where they were invited.</span>
                  ) : (
                    <span className="sx-field__help">
                      {!assignableRoles.includes("OWNER") ? "Only an Owner can make someone an Owner." : "Owners can assign any role."}
                    </span>
                  )}
                </label>
                {m.status !== "INVITED" && !m.roleInherited ? (
                  <button
                    type="button"
                    className={m.status === "DISABLED" ? "sx-btn sx-btn--primary" : "sx-btn sx-btn--secondary"}
                    disabled={busy || (m.role === "OWNER" && live.actorRole !== "OWNER")}
                    onClick={() => void toggleDisabled()}
                  >
                    {m.status === "DISABLED" ? "Re-enable access" : "Disable access"}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="kv">
                <span>Role</span>
                <span>
                  {roleLabel}
                  {m.roleInherited ? " · Inherited" : ""}
                </span>
              </div>
            )}
            <div className="kv">
              <span>Status</span>
              <span>
                {m.status === "INVITED" ? (
                  <span className="sx-pill sx-pill--pending">Invited</span>
                ) : m.status === "DISABLED" ? (
                  <span className="sx-pill sx-pill--failed">Disabled</span>
                ) : (
                  <span className="sx-pill sx-pill--settled">Active</span>
                )}
              </span>
            </div>
          </section>

          <section className="tile s4" aria-labelledby="lim">
            <div className="tile-head">
              <h2 className="tile-title" id="lim">
                Limits
              </h2>
              {canManage ? (
                <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setEditOpen((v) => !v)}>
                  {editOpen ? "Close" : "Edit"}
                </button>
              ) : null}
            </div>
            {editOpen ? (
              <div style={{ display: "grid", gap: 12 }}>
                <label className="sx-field">
                  <span className="sx-label">Per payment · USD</span>
                  <input className="sx-field__input" value={perPay} onChange={(e) => setPerPay(e.target.value)} />
                </label>
                <button type="button" className="sx-btn sx-btn--primary" disabled={busy} onClick={() => void saveLimits()}>
                  {busy ? "Saving…" : "Save limits"}
                </button>
              </div>
            ) : (
              <>
                <div className="kv">
                  <span>Per payment</span>
                  <span>{usd(m.perPaymentLimitMinor)}</span>
                </div>
                <div className="kv">
                  <span>Monthly / daily</span>
                  <span>{usd(m.dailyLimitMinor)}</span>
                </div>
                <div className="kv">
                  <span>Can pay</span>
                  <span>{access.pay}</span>
                </div>
                <div className="kv">
                  <span>Can approve</span>
                  <span>{access.approve}</span>
                </div>
              </>
            )}
          </section>

          <section className="tile s8" aria-labelledby="methods">
            <div className="tile-head">
              <h2 className="tile-title" id="methods">
                Cards and QR
              </h2>
              <Link href={`/team/${m.id}/methods/new`} className="sx-btn sx-btn--quiet">
                Assign Pix, QRIS or PromptPay
              </Link>
            </div>
            {methods.length === 0 && cards.length === 0 ? (
              <p className="body-s muted" style={{ margin: 0 }}>
                No cards or local QR yet. Assign one from here or open Spending.
              </p>
            ) : (
              <ul className="body-s" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                {cards.map((c) => (
                  <li key={`card-${c.id}`}>
                    <Link href="/spending" style={{ color: "inherit" }}>
                      Card · {c.label} · •••• {c.lastFour} · {formatMethodMoney(c.currency, c.monthlyLimitMinor)} / mo
                    </Link>
                  </li>
                ))}
                {methods.map((sm) => (
                  <li key={`sm-${sm.id}`}>
                    <Link href="/spending" style={{ color: "inherit" }}>
                      {sm.type} · {sm.label} · {formatMethodMoney(sm.currency, sm.monthlyLimitMinor)} / mo
                      {sm.status !== "ACTIVE" ? ` · ${sm.status}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="tile-foot">
              <Link href="/spending" className="sx-btn sx-btn--secondary sx-btn--sm">
                Open Spending
              </Link>
            </div>
          </section>
        </div>
      </div>
    )
  }

  // Demo fallback (ana etc.)
  const person = getPerson(personId)!
  const first = person.name.split(" ")[0]
  const isAna = person.id === "ana"
  const canSpend = person.role === "Employee" || person.role === "Finance"
  const access = roleAccess[person.role] ?? { pay: "No", approve: "No" }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="body-s muted">
            <Link href="/team">Team</Link> / {person.name}
          </nav>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span className="av av--lg">{person.initials}</span>
            <div style={{ display: "grid", gap: 2 }}>
              <h1 className="sx-h heading-2">{person.name}</h1>
              <span className="body-s muted">
                {person.role} · {isAna ? "São Paulo, Brazil" : person.country}
                {isAna ? " · ana@cafepaulista.com.br" : ""} · Demo
              </span>
            </div>
          </div>
        </div>
        {canSpend ? (
          <Link href={`/team/${person.id}/methods/new`} className="sx-btn sx-btn--primary">
            Add a card or Pix access
          </Link>
        ) : null}
      </header>

      <div className="grid">
        <section className="tile s4" aria-labelledby="lim">
          <h2 className="tile-title" id="lim">
            Limits
          </h2>
          <div className="kv">
            <span>Per payment</span>
            <span>$500.00</span>
          </div>
          <div className="kv">
            <span>Can pay</span>
            <span>{access.pay}</span>
          </div>
          <div className="kv">
            <span>Can approve</span>
            <span>{access.approve}</span>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">Demo profile for {first}. Live members open from Team.</span>
          </div>
        </section>
        <section className="tile s8">
          <h2 className="tile-title">Cards and QR</h2>
          <Link href={`/team/${person.id}/methods/new`} className="sx-btn sx-btn--secondary sx-btn--sm">
            Assign method
          </Link>
        </section>
      </div>
    </div>
  )
}