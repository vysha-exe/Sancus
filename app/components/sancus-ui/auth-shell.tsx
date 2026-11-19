import Link from "next/link"
import type { ReactNode } from "react"
import { RisingColumn } from "./logo"

export const BUSINESS_SIGN_UP_STEPS = ["Email", "Code", "Type", "Company", "Currency", "Team"] as const
export const PERSONAL_SIGN_UP_STEPS = ["Email", "Code", "Type", "You", "Currency"] as const

type StepState = "done" | "now" | ""

/** Three-step sliding window that matches the wireframe side panel. */
function progressWindow(steps: readonly string[], step: number) {
  const n = steps.length
  const current = Math.min(Math.max(step, 0), n)
  const start = n <= 3 ? 0 : Math.max(0, Math.min(current === n ? n - 3 : current - 1, n - 3))
  return Array.from({ length: Math.min(3, n) }, (_, i) => {
    const idx = start + i
    const state: StepState =
      idx < current ? "done" : idx === current && current < n ? "now" : current >= n ? "done" : ""
    return { label: steps[idx]!, number: idx + 1, state }
  })
}

/**
 * Chrome for sign-in and sign-up: form on white at left, gradient panel at right.
 * Pass `step` (0-based; `steps.length` when finished) to show the progress list.
 * Omit it for sign-in / demo — marketing copy, matching the wireframes.
 */
export function AuthShell({
  step,
  steps = BUSINESS_SIGN_UP_STEPS,
  headEnd,
  children,
}: {
  step?: number
  steps?: readonly string[]
  headEnd?: ReactNode
  children: ReactNode
}) {
  const window = step === undefined ? null : progressWindow(steps, step)

  return (
    <div className="sx auth" data-theme="day">
      <div className="auth-main">
        <header className="auth-head">
          <Link href="/" className="sx-lockup sx-wordmark" aria-label="Sancus home">
            <RisingColumn />
            SANCUS
          </Link>
          <div className="auth-head-end">{headEnd}</div>
        </header>
        <div className="auth-body">{children}</div>
      </div>
      <aside className="build" aria-label={window ? "Sign-up progress" : undefined}>
        <div className="gp">
          <div className="gp-in">
            <span className="gp-logo">
              <RisingColumn />
              SANCUS
            </span>
            {window ? (
              <>
                <h2>Get started with Sancus</h2>
                <p>Open your account in a few steps.</p>
                <ol className="gsteps">
                  {window.map(({ label, number, state }) => (
                    <li key={`${number}-${label}`} className={state}>
                      <b>{state === "done" ? "✓" : number}</b>
                      {label}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <>
                <h2>Your money, in one place.</h2>
                <p className="gp-meta">9 rails · 60 s rate lock · 1:1 to USDC</p>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}
