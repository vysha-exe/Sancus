"use client"

// Sign in with email and password. Account type (and home path) come from the
// signed-in account via /api/sancus/accounts/me — no portal pick beforehand.
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { createClient } from "@/lib/supabase/client"
import type { AccountDto } from "@/lib/sancus/accounts"
import { resetAccountCache } from "@/lib/sancus/use-account"
import { AuthShell } from "./auth-shell"

export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw new Error(authError.message === "Invalid login credentials" ? "That email and password don't match." : authError.message)
      resetAccountCache()
      const res = await fetch("/api/sancus/accounts/me", { cache: "no-store" })
      const body = res.ok ? ((await res.json()) as { account: AccountDto }) : null
      router.push(body?.account?.homePath ?? "/home")
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <AuthShell
      headEnd={
        <>
          New to Sancus? <Link href="/sign-up">Open an account</Link>
        </>
      }
    >
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <h1 id="q" className="sx-h heading-1">
            Welcome back.
          </h1>
        </div>
        <div className="auth-fields">
          <label className="sx-field">
            <span className="sx-label">Email</span>
            <input
              id="signin-email"
              className="sx-field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
              <Link href="/auth/forgot-password">Forgot it?</Link>
            </span>
          </label>
          {error ? (
            <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          ) : null}
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <Link href="/demo" className="sx-btn sx-btn--secondary">
            Try the demo
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
