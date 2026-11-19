"use client"

// Logins for your people. Admins create Branch admins (on a branch, or with a new branch) and
// Employees anywhere; Branch admins create and manage Employees in their own branch only.
// Backed by /api/sancus/accounts; the server and database enforce the same limits.
import { useCallback, useEffect, useState } from "react"
import type { AccountDto } from "@/lib/sancus/accounts"
import { COUNTRIES, countryByCode } from "@/lib/sancus/countries"

type Company = { id: string; parentId: string | null; name: string; country: string }
type Person = {
  membershipId: string
  companyId: string
  companyName: string
  email: string | null
  accountType: "ADMIN" | "BRANCH" | "EMPLOYEE"
  role: string
  status: string
  perPaymentLimitMinor: string | null
  dailyLimitMinor: string | null
}
type Created = { email: string; temporaryPassword: string; type: "BRANCH" | "EMPLOYEE"; where: string }

const usd = (minor: string | null) => (minor ? `$${(Number(minor) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "No limit")
const toMinor = (dollars: string) => (/^\d+(\.\d{1,2})?$/.test(dollars) ? String(Math.round(Number(dollars) * 100) * 10_000) : null)
const TYPE_LABEL = { ADMIN: "Admin", BRANCH: "Branch admin", EMPLOYEE: "Employee" } as const

/**
 * `scopeCompanyId`: the branch picked in the workspace switcher. A branch shows only its own people
 * (and anything under it); the global account, or none, shows everyone.
 */
export function AccountsManager({ title = "Logins", scopeCompanyId = null }: { title?: string; scopeCompanyId?: string | null }) {
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading")
  const [account, setAccount] = useState<AccountDto | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [type, setType] = useState<"EMPLOYEE" | "BRANCH">("EMPLOYEE")
  const [companyId, setCompanyId] = useState("")
  const [newBranch, setNewBranch] = useState(false)
  const [branchName, setBranchName] = useState("")
  const [branchCountry, setBranchCountry] = useState("TH")
  const [employeeCountry, setEmployeeCountry] = useState("TH")
  const [firstName, setFirstName] = useState("")
  const [email, setEmail] = useState("")
  const [perPay, setPerPay] = useState("500")
  const [daily, setDaily] = useState("1000")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/accounts", { cache: "no-store" })
      if (res.status === 401) return setState("signed-out")
      const body = await res.json()
      if (!res.ok) throw new Error()
      setAccount(body.account)
      setCompanies(body.companies)
      setPeople(body.people)
      const defaultCompany = (body.companies.find((c: Company) => c.parentId) ?? body.companies[0]) as Company | undefined
      setCompanyId((cur) => cur || defaultCompany?.id || "")
      setEmployeeCountry((cur) => cur || defaultCompany?.country || "TH")
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (state === "signed-out") return null
  if (state === "error") return <section className="tile s12"><div className="empty">Couldn&apos;t load logins. Refresh to try again.</div></section>
  if (state === "loading" || !account) return <section className="tile s12"><div className="empty">Loading logins…</div></section>
  if (!account.permissions.includes("members.manage")) return null

  const isAdmin = account.type === "ADMIN"
  const branches = companies.filter((c) => c.parentId)
  const targets = type === "BRANCH" ? branches : companies
  const nameOf = (id: string) => companies.find((c) => c.id === id)?.name ?? ""
  const scopeNode = scopeCompanyId ? companies.find((c) => c.id === scopeCompanyId) : undefined
  const inScope = new Set<string>()
  if (scopeNode?.parentId) {
    inScope.add(scopeNode.id)
    for (let added = true; added; ) {
      added = false
      for (const c of companies) if (c.parentId && inScope.has(c.parentId) && !inScope.has(c.id)) (inScope.add(c.id), (added = true))
    }
  }
  const shown = inScope.size ? people.filter((p) => inScope.has(p.companyId)) : people

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy("create")
    setError(null)
    setCreated(null)
    const body: Record<string, unknown> = { type, firstName: firstName.trim(), email: email.trim() }
    if (type === "BRANCH" && newBranch) body.newBranch = { name: branchName.trim(), country: branchCountry }
    else if (type === "EMPLOYEE" && isAdmin) {
      const existingCountry = companies.find((company) => company.country === employeeCountry)
      if (existingCountry) body.companyId = existingCountry.id
      else {
        body.companyId = companies.find((company) => !company.parentId)?.id
        body.newBranch = { name: countryByCode(employeeCountry)?.name ?? employeeCountry, country: employeeCountry }
      }
    } else body.companyId = companyId
    if (type === "EMPLOYEE") {
      const p = toMinor(perPay)
      const d = toMinor(daily)
      if (!p || !d) {
        setBusy(null)
        return setError("Limits are dollar amounts, like 500")
      }
      body.perPaymentLimitMinor = p
      body.dailyLimitMinor = d
    }
    try {
      const res = await fetch("/api/sancus/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error ?? "Couldn't create the login")
      setCreated({ ...out.login, where: out.branchCreated?.name ?? nameOf(out.companyId) })
      setCopied(false)
      setFirstName("")
      setEmail("")
      setBranchName("")
      setNewBranch(false)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function toggle(p: Person) {
    setBusy(p.membershipId)
    setError(null)
    try {
      const res = await fetch(`/api/sancus/accounts/${p.membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: p.status === "DISABLED" ? "ACTIVE" : "DISABLED" }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error ?? "Couldn't change access")
      setPeople((prev) => prev.map((x) => (x.membershipId === p.membershipId ? { ...x, status: out.status } : x)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function copyCreds() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(`Sancus login\nEmail: ${created.email}\nTemporary password: ${created.temporaryPassword}\nSign in: ${window.location.origin}/sign-in`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <section className="tile s5" aria-labelledby="new-login">
        <div className="tile-head">
          <h2 className="tile-title" id="new-login">
            Add a login
          </h2>
        </div>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          {isAdmin ? (
            <div className="filters" role="group" aria-label="Account type">
              <button type="button" className="chip" aria-pressed={type === "EMPLOYEE"} onClick={() => setType("EMPLOYEE")}>
                Employee
              </button>
              <button type="button" className="chip" aria-pressed={type === "BRANCH"} onClick={() => setType("BRANCH")}>
                Branch admin
              </button>
            </div>
          ) : (
            <span className="body-s muted">You can add employees to {companies.length === 1 ? companies[0]!.name : "your branches"}.</span>
          )}

          {type === "BRANCH" && isAdmin ? (
            <label className="check">
              <input id="new-branch" type="checkbox" checked={newBranch} onChange={(e) => setNewBranch(e.target.checked)} />
              <span>Create a new branch for them</span>
            </label>
          ) : null}

          {type === "EMPLOYEE" && isAdmin ? (
            <label className="sx-field">
              <span className="sx-label">Works in</span>
              <select id="employee-country" className="sx-field__input" value={employeeCountry} onChange={(e) => setEmployeeCountry(e.target.value)}>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </select>
              {!companies.some((company) => company.country === employeeCountry) ? (
                <span className="sx-field__help">Creates the {countryByCode(employeeCountry)?.name ?? employeeCountry} branch with this login.</span>
              ) : null}
            </label>
          ) : type === "BRANCH" && newBranch ? (
            <div className="grid" style={{ gap: 10 }}>
              <label className="sx-field s7">
                <span className="sx-label">Branch name</span>
                <input id="branch-name" className="sx-field__input" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Bangkok" />
              </label>
              <label className="sx-field s5">
                <span className="sx-label">Country</span>
                <select id="branch-country" className="sx-field__input" value={branchCountry} onChange={(e) => setBranchCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="sx-field">
              <span className="sx-label">{type === "BRANCH" ? "Branch" : "Works in"}</span>
              <select id="login-company" className="sx-field__input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {countryByCode(c.country)?.flag ?? ""} {c.name}
                    {c.parentId ? "" : " (global account)"}
                  </option>
                ))}
              </select>
              {type === "BRANCH" && !branches.length ? <span className="sx-field__help">Add a branch first, or tick “Create a new branch”.</span> : null}
            </label>
          )}

          <div className="grid" style={{ gap: 10 }}>
            <label className="sx-field s5">
              <span className="sx-label">First name</span>
              <input id="login-first" className="sx-field__input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
            </label>
            <label className="sx-field s7">
              <span className="sx-label">Work email</span>
              <input id="login-email" className="sx-field__input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </label>
          </div>

          {type === "EMPLOYEE" ? (
            <div className="grid" style={{ gap: 10 }}>
              <label className="sx-field s6">
                <span className="sx-label">Per payment ($)</span>
                <input id="login-perpay" className="sx-field__input" inputMode="decimal" value={perPay} onChange={(e) => setPerPay(e.target.value)} />
              </label>
              <label className="sx-field s6">
                <span className="sx-label">Per day ($)</span>
                <input id="login-daily" className="sx-field__input" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
              </label>
            </div>
          ) : (
            <span className="body-s muted">Branch admins manage their own branch&apos;s people. They can&apos;t see the global account, other branches, or move company money.</span>
          )}

          <div className="tile-foot">
            <span className="body-s muted">{type === "EMPLOYEE" ? "Gets a virtual card at these limits" : "Gets access to that branch only"}</span>
            <button type="submit" className="sx-btn sx-btn--primary" disabled={busy !== null || !firstName.trim() || !email.trim()}>
              {busy === "create" ? "Creating…" : "Create login"}
            </button>
          </div>
          {error ? (
            <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          ) : null}
        </form>

        {created ? (
          <div role="status" style={{ display: "grid", gap: 6, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
            <span className="body-strong">
              {TYPE_LABEL[created.type]} login ready for {created.where}
            </span>
            <div className="kv">
              <span>Email</span>
              <span className="data">{created.email}</span>
            </div>
            <div className="kv">
              <span>Temporary password</span>
              <span className="data">{created.temporaryPassword}</span>
            </div>
            <span className="body-s muted">Shown once. Share it privately; they sign in at Sign in → {created.type === "EMPLOYEE" ? "Employee" : "Business → Branch"}.</span>
            <div>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={copyCreds}>
                {copied ? "Copied" : "Copy login details"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="tile s7" aria-labelledby="logins">
        <div className="tile-head">
          <h2 className="tile-title" id="logins">
            {title}
            {inScope.size ? ` · ${scopeNode?.name}` : ""}
          </h2>
          <span className="body-s muted">{shown.length} {shown.length === 1 ? "person" : "people"}</span>
        </div>
        {shown.length ? (
          <div className="sx-rows">
            {shown.map((p) => (
              <div key={p.membershipId} className="sx-row" style={{ opacity: p.status === "DISABLED" ? 0.55 : 1 }}>
                <span className="sx-row__who">
                  {p.email ?? "Invited"}
                  <span className="body-s muted" style={{ display: "block" }}>
                    {TYPE_LABEL[p.accountType]} · {p.companyName}
                    {p.accountType === "EMPLOYEE" ? ` · ${usd(p.perPaymentLimitMinor)}/payment, ${usd(p.dailyLimitMinor)}/day` : ""}
                  </span>
                </span>
                <span className="sx-row__amount">
                  {p.status === "INVITED" ? (
                    <span className="sx-pill sx-pill--pending">Invited</span>
                  ) : p.accountType === "ADMIN" || (account.type === "BRANCH" && p.accountType === "BRANCH") ? (
                    <span className="sx-pill sx-pill--settled">{p.status === "DISABLED" ? "Disabled" : "Active"}</span>
                  ) : (
                    <button type="button" className="sx-btn sx-btn--quiet sx-btn--sm" onClick={() => toggle(p)} disabled={busy !== null}>
                      {busy === p.membershipId ? "Saving…" : p.status === "DISABLED" ? "Turn back on" : "Turn off access"}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">No one yet. Create a login and it shows up here.</div>
        )}
      </section>
    </>
  )
}
