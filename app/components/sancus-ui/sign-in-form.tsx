"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { AuthShell } from "./auth-shell"

/** Mock sign-in: email a code, or jump into the demo account. Both land in /home. */
export function SignInForm() {
  const router = useRouter()
  const [email, setEmail] = useState("maya@cafepaulista.com.br")

  function submit(e: FormEvent) {
    e.preventDefault()
    router.push("/home")
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
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <h1 id="q" className="sx-h heading-1">
            Welcome back.
          </h1>
        </div>
        <div className="auth-fields">
          <label className="sx-field">
            <span className="sx-label">Work email</span>
            <input
              className="sx-field__input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary">
            Email me a code
          </button>
          <Link href="/home" className="sx-btn sx-btn--secondary">
            Use the demo account
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}
