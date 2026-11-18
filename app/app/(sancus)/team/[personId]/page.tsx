"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { ROLE_LABEL, type Role } from "@/lib/sancus/companies"
import { getPerson } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { MemberDto } from "@/lib/sancus/members"

type LivePayload = {
  member: MemberDto
  company: { id: string; name: string; country: string; currency: string }
  can: { invite: boolean }
  actorRole: Role
}

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

export default function EmployeePage() {
  const params = useParams<{ personId: string }>()
  const personId = params?.personId ?? ""
  const [live, setLive] = useState<LivePayload | null>(null)
  const [mode, setMode] = useState<"loading" | "live" | "demo" | "missing">("loading")
  const [editOpen, setEditOpen] = useState(false)
  const [perPay, setPerPay] = useState("500")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!isUuid(personId)) {
      setMode(getPerson(personId) ? "demo" : "missing")
      return
    }
    try {
      const res = await fetch(`/api/sancus/companies/members/${personId}`, { cache: "no-store" })
      if (!res.ok) {
        setMode(getPerson(personId) ? "demo" : "missing")
        return
      }
      const body = (await res.json()) as LivePayload
      setLive(body)
      if (body.member.perPaymentLimitMinor) {
        setPerPay(displayMinor(BigInt(body.member.perPaymentLimitMinor), USDC_DECIMALS, "", 2))
      }
      setMode("live")
    } catch {
      setMode(getPerson(personId) ? "demo" : "missing")
    }
  }, [personId])

  useEffect(() => {
    void load()
  }, [load])

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
        setBusy(false)
        return
      }
      setEditOpen(false)
      await load()
      setMsg("Limits saved")
    } catch {
      setMsg("Could not reach the server")
    }
    setBusy(false)
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
              They may have been removed, or the link is out of date.
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
          <section className="tile s4" aria-labelledby="lim">
            <div className="tile-head">
              <h2 className="tile-title" id="lim">
                Limits
              </h2>
              {live.can.invite && !isViewer ? (
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
            <p className="body-s muted" style={{ margin: 0 }}>
              Issue a local QR or card from Assign method. Live methods show on Spending.
            </p>
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
            Add a card or QR
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
