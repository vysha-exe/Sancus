import Link from "next/link"
import type { ReactNode } from "react"
import { RisingColumn } from "./logo"

export const SIGN_UP_STEPS = ["Email", "Code", "Company", "Currency", "Team"] as const

type FluteState = "done" | "now" | "todo"

/**
 * The Rising column, built flute by flute. `done` is how many of the five steps are complete (0-5).
 * Geometry matches the wireframe: five flutes under the two cap bars, the middle one S-shaped once built.
 */
export function BuildColumn({ done }: { done: number }) {
  const state = (i: number): FluteState => (i < done ? "done" : i === done ? "now" : "todo")
  const cls = (i: number) => `f-${state(i)}`
  const rects = [
    { i: 0, x: 13.2, h: 12.5 },
    { i: 1, x: 21.45, h: 18.5 },
    { i: 3, x: 37.95, h: 26.5 },
    { i: 4, x: 46.2, h: 31.5 },
  ]
  const rect = (i: number) => {
    const r = rects.find((x) => x.i === i)!
    return <rect key={i} className={cls(i)} x={r.x} y="27.5" width="4.6" height={r.h} rx="1" />
  }
  return (
    <svg className="build-col" viewBox="0 4 64 58" role="img" aria-label={`${done} of 5 steps done`}>
      <rect className="cap-done" x="7" y="9" width="50" height="8.5" rx="1.5" />
      <rect className="cap-done" x="12" y="20" width="40" height="3.6" rx=".6" />
      {rect(0)}
      {rect(1)}
      {state(2) === "todo" ? (
        <rect className="f-todo" x="29.7" y="27.5" width="4.6" height="22.5" rx="1" />
      ) : (
        <path className={cls(2)} d="M32 27.5 C 26.5 31.5 37.5 35.5 32 39.5 L32 50" strokeWidth="4.6" />
      )}
      {rect(3)}
      {rect(4)}
    </svg>
  )
}

/**
 * Chrome for sign-in and sign-up: form on white at left, the Rising column at right.
 * `done` drives the column and step list; sign-in passes 5 so the column reads as complete.
 */
export function AuthShell({
  done,
  headEnd,
  children,
}: {
  done: number
  headEnd?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="sx auth" data-theme="day">
      <div className="auth-main">
        <header className="auth-head">
          <Link href="/" className="sx-lockup sx-wordmark" aria-label="Sancus home">
            <RisingColumn />
            SANCUS
          </Link>
          <div className="auth-head-end">
            {headEnd}
            <span className="sx-pill sx-pill--simulated">Sandbox · testnet</span>
          </div>
        </header>
        <div className="auth-body">{children}</div>
      </div>
      <aside className="build" aria-label="Sign-up progress">
        <BuildColumn done={done} />
        <ol className="build-list">
          {SIGN_UP_STEPS.map((label, i) => (
            <li key={label} className={i < done ? "done" : i === done ? "now" : ""}>
              <b>{i + 1}</b>
              {label}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
