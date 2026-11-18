"use client"

// Sign in, split by who you are: Business (admin or branch), Employee, or Individual.
// The portal you pick is a hint; after sign-in the account's real type decides where you land,
// so an employee can't reach the admin dashboard by picking "Business".
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useState, type FormEvent } from "react"
import { createClient } from "@/lib/supabase/client"
import { ACCOUNT_TYPE_LABEL, type AccountDto, type AccountType } from "@/lib/sancus/accounts"
import { resetAccountCache } from "@/lib/sancus/use-account"
import { AuthShell } from "./auth-shell"

type Portal = "admin" | "branch" | "employee" | "individual"
const PORTALS: Portal[] = ["admin", "branch", "employee", "individual"]
const EXPECT: Record<Portal, AccountType> = { admin: "ADMIN", branch: "BRANCH", employee: "EMPLOYEE", individual: "INDIVIDUAL" }
const COPY: Record<Portal, { title: string; detail: string; email: string }> = {
  admin: { title: "Business admin", detail: "Owner or admin of the global account. Everything, every branch.", email: "Work email" },
  branch: { title: "Branch", detail: "Run one branch and its people.", email: "Work email" },
  employee: { title: "Employee", detail: "Your card, your limits, your agent.", email: "Work email" },
  individual: { title: "Individual", detail: "A personal dollar account. No business needed.", email: "Email" },
}

export function SignInForm() {
  const router = useRouter()
  const params = useSearchParams()
  const initial = params.get("as")
  const [portal, setPortal] = useState<Portal | null>(PORTALS.includes(initial as Portal) ? (initial as Portal) : null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!portal) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw new Error(authError.message === "Invalid login credentials" ? "That email and password don't match." : authError.message)
      resetAccountCache()
      const res = await fetch("/api/sancus/accounts/me", { cache: "no-store" })
      const body = res.ok ? ((await res.json()) as { account: AccountDto }) : null
      const account = body?.account
      if (!account) return router.push("/home")
      if (account.type !== EXPECT[portal]) {
        setNotice(`This login is a ${ACCOUNT_TYPE_LABEL[account.type]} account, so we're opening that dashboard.`)
        setTimeout(() => router.push(account.homePath), 1400)
        return
      }
      router.push(account.homePath)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      done={5}
      headEnd={
        <>
          New to Sancus? <Link href="/sign-up">Open an account</Link>
        </>
      }
    >
      {!portal ? (
        <div aria-labelledby="q" style={{ display: "grid", gap: 20 }}>
          <div className="auth-q">
            <h1 id="q" className="sx-h heading-1">
              Who&apos;s signing in?
            </h1>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <span className="sx-label">Business</span>
            {(["admin", "branch"] as Portal[]).map((p) => (
              <PortalButton key={p} portal={p} onPick={setPortal} />
            ))}
            <span className="sx-label" style={{ marginTop: 8 }}>
              Not running the business
            </span>
            {(["employee", "individual"] as Portal[]).map((p) => (
              <PortalButton key={p} portal={p} onPick={setPortal} />
            ))}
          </div>
        </div>
      ) : (
        <form aria-labelledby="q" onSubmit={submit}>
          <div className="auth-q">
            <button type="button" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }} onClick={() => setPortal(null)}>
              ← Change
            </button>
            <span className="sx-label">{portal === "admin" || portal === "branch" ? "Business" : COPY[portal].title}</span>
            <h1 id="q" className="sx-h heading-1">
              {portal === "individual" ? "Welcome back." : `Sign in as ${COPY[portal].title.toLowerCase()}.`}
            </h1>
          </div>
          <div className="auth-fields">
            <label className="sx-field">
              <span className="sx-label">{COPY[portal].email}</span>
              <input id="signin-email" className="sx-field__input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="sx-field">
              <span className="sx-label">Password</span>
              <input
                id="signin-password"
                className="sx-field__input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span className="sx-field__help">
                {portal === "branch" || portal === "employee" ? "First time? Use the temporary password your admin gave you. " : ""}
                <Link href="/auth/forgot-password">Forgot it?</Link>
              </span>
            </label>
            {error ? (
              <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
                {error}
              </span>
            ) : null}
            {notice ? (
              <span className="body-s" role="status">
                {notice}
              </span>
            ) : null}
          </div>
          <div className="auth-btns">
            <button type="submit" className="sx-btn sx-btn--primary" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <a href={`/api/sancus/demo-login?as=${portal}`} className="sx-btn sx-btn--secondary">
              Try the {COPY[portal].title.toLowerCase()} demo
            </a>
          </div>
        </form>
      )}
    </AuthShell>
  )
}

function PortalButton({ portal, onPick }: { portal: Portal; onPick: (p: Portal) => void }) {
  const business = portal === "admin" || portal === "branch"
  return (
    <button type="button" className={`pick${business ? " pick--business" : ""}`} onClick={() => onPick(portal)} style={{ width: "100%" }}>
      <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2, textAlign: "left", justifyItems: "start" }}>
        <span className="body-strong">{COPY[portal].title}</span>
        <span className="body-s">{COPY[portal].detail}</span>
      </span>
      <span className="pick__chev" aria-hidden>
        →
      </span>
    </button>
  )
}
