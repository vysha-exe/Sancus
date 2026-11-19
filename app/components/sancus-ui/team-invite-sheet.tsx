"use client"

import { useState, type FormEvent } from "react"
import { ROLE_LABEL, type Role } from "@/lib/sancus/companies"

const ROLE_HELP: Record<Role, string> = {
  OWNER: "Full control of this company and every branch below.",
  ADMIN: "Team, branches and rules. Can't make someone an Owner.",
  FINANCE: "Pays and approves within limits. Can't change rules or invite.",
  EMPLOYEE: "Pays within limits. Can't approve.",
  VIEWER: "Can see balances and activity. Can't spend or change anything.",
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function parseUsdToMinor(raw: string): string | null {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
  if (!Number.isFinite(n) || n < 0) return null
  return String(Math.round(n * 1e9))
}

function parseLocalToCents(raw: string): string | null {
  const n = Number.parseFloat(raw.replace(/[^0-9.,]/g, "").replace(",", "."))
  if (!Number.isFinite(n) || n < 0) return null
  return String(Math.round(n * 100))
}

export function TeamInviteSheet({
  open,
  onClose,
  companyId,
  companyName,
  inviteRoles,
  localCurrency = "BRL",
  onSent,
}: {
  open: boolean
  onClose: () => void
  companyId: string
  companyName: string
  inviteRoles: Role[]
  localCurrency?: string
  onSent: (acceptPath: string) => void
}) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>(inviteRoles.includes("EMPLOYEE") ? "EMPLOYEE" : inviteRoles[0] ?? "EMPLOYEE")
  const [access, setAccess] = useState<"and-below" | "this-only">("and-below")
  const [monthlyLocal, setMonthlyLocal] = useState("5000")
  const [perPaymentUsd, setPerPaymentUsd] = useState("500.00")
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [roleHelpId] = useState(() => `role-help-${Math.random().toString(36).slice(2, 8)}`)

  if (!open) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFieldError(null)
    try {
      const res = await fetch(`/api/sancus/companies/${companyId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          // Both radios map to membership on this node; inheritance covers descendants.
          accessScope: access,
          perPaymentLimitMinor: parseUsdToMinor(perPaymentUsd),
          monthlyLimitMinor: parseLocalToCents(monthlyLocal),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; acceptPath?: string }
      if (!res.ok) {
        setFieldError(body.error ?? (res.status >= 500 ? "Could not send invite — try again" : "Could not invite"))
        return
      }
      setEmail("")
      onSent(typeof body.acceptPath === "string" ? body.acceptPath : "")
      onClose()
    } catch {
      setFieldError("Could not reach the server")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="scrim" aria-label="Close invite" onClick={onClose} />
      <section className="sheet sx" role="dialog" aria-modal="true" aria-labelledby="inv-t">
        <div className="sheet-head">
          <h2 className="sx-h heading-3" id="inv-t" style={{ margin: 0 }}>
            Invite to {companyName}
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <form className="sheet-body" onSubmit={submit} id="team-invite-form">
          <label className={`sx-field${fieldError && /already|member/i.test(fieldError) ? " sx-field--error" : ""}`}>
            <span className="sx-label">Email</span>
            <input
              className="sx-field__input"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError(null)
              }}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? "inv-err" : undefined}
            />
            {fieldError ? (
              <span className="sx-field__help" id="inv-err" role="alert">
                {fieldError}
              </span>
            ) : null}
          </label>

          <div className="sx-field">
            <span className="sx-label">Role</span>
            <label className="vh" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              className="sx-field__input"
              value={role}
              aria-describedby={roleHelpId}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {inviteRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <span className="sx-field__help" id={roleHelpId}>
              {ROLE_HELP[role]}
            </span>
            {!inviteRoles.includes("OWNER") ? (
              <span className="sx-field__help">Only an Owner can make someone an Owner.</span>
            ) : null}
          </div>

          <div role="radiogroup" aria-label="Access" style={{ display: "grid", gap: 8 }}>
            <span className="sx-label">Access</span>
            <button
              type="button"
              role="radio"
              aria-checked={access === "and-below"}
              className={`pick${access === "and-below" ? " pick--on" : ""}`}
              style={{ width: "100%", textAlign: "left", font: "inherit" }}
              onClick={() => setAccess("and-below")}
            >
              <span className="radio" />
              <span style={{ display: "grid", gap: 2 }}>
                <span className="body-strong">{companyName} and below</span>
                <span className="body-s">Includes branches under this one</span>
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={access === "this-only"}
              className={`pick${access === "this-only" ? " pick--on" : ""}`}
              style={{ width: "100%", textAlign: "left", font: "inherit" }}
              onClick={() => setAccess("this-only")}
            >
              <span className="radio" />
              <span style={{ display: "grid", gap: 2 }}>
                <span className="body-strong">{companyName} only</span>
                <span className="body-s">Not the branches below</span>
              </span>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label className="sx-field">
              <span className="sx-label">Monthly budget · {localCurrency}</span>
              <input
                className="sx-field__input"
                inputMode="decimal"
                value={monthlyLocal}
                onChange={(e) => setMonthlyLocal(e.target.value)}
              />
            </label>
            <label className="sx-field">
              <span className="sx-label">Per payment · USD</span>
              <input
                className="sx-field__input"
                inputMode="decimal"
                value={perPaymentUsd}
                onChange={(e) => setPerPaymentUsd(e.target.value)}
              />
            </label>
          </div>
          <div className="kv">
            <span>Over ${perPaymentUsd.replace(/^\$/, "") || "0"} goes to</span>
            <span>approvers on this branch</span>
          </div>
        </form>
        <div className="sheet-foot">
          <button type="submit" form="team-invite-form" className="sx-btn sx-btn--primary" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send invite"}
          </button>
          <button type="button" className="sx-btn sx-btn--secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </>
  )
}
