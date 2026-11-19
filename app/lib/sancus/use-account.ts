"use client"

// The signed-in user's account (admin / branch / employee / individual), shared by every screen.
// Signed out (guest demo UI): null, and screens fall back to the full admin demo.
import { useEffect, useState } from "react"
import type { AccountDto, Permission } from "./accounts"
import { navKeyForPath } from "./accounts"

type State = { account: AccountDto | null; ready: boolean; signedOut: boolean }

let cached: State | null = null
let inflight: Promise<State> | null = null

async function fetchAccount(): Promise<State> {
  try {
    const res = await fetch("/api/sancus/accounts/me", { cache: "no-store" })
    if (res.status === 401) return { account: null, ready: true, signedOut: true }
    if (!res.ok) return { account: null, ready: true, signedOut: false }
    const body = await res.json()
    return { account: body.account as AccountDto, ready: true, signedOut: false }
  } catch {
    return { account: null, ready: true, signedOut: false }
  }
}

/** Forget the cached account (after signing in or out). */
export function resetAccountCache() {
  cached = null
  inflight = null
}

export function useAccount(): State {
  const [state, setState] = useState<State>(cached ?? { account: null, ready: false, signedOut: false })
  useEffect(() => {
    if (cached) return
    let alive = true
    inflight ??= fetchAccount()
    inflight.then((s) => {
      cached = s
      if (alive) setState(s)
    })
    return () => {
      alive = false
    }
  }, [])
  return state
}

export function can(account: AccountDto | null, p: Permission): boolean {
  // Guest demo (no account): behave like the admin demo.
  return account ? account.permissions.includes(p) : true
}

/** Path check matching SancusAccount.canAccessPath, from the DTO. */
export function canOpenPath(account: AccountDto | null, pathname: string): boolean {
  if (!account) return true
  const key = navKeyForPath(pathname)
  if (key === null) return true
  if (key === "devqa" && account.nav.includes("devqa")) return true
  // Must match each class's `paths` beyond its nav in accounts.ts (tests/sancus-accounts.test.ts checks).
  const extra: Record<AccountDto["type"], string[]> = {
    ADMIN: ["receive", "branch"],
    BRANCH: [],
    EMPLOYEE: ["pay"], // Me → Request a payment
    INDIVIDUAL: ["receive", "branches"],
  }
  return account.nav.includes(key) || extra[account.type].includes(key)
}

/**
 * What to call the signed-in account: a business admin is their company, a branch admin is their
 * branch, and people (employees, individuals) are their first name.
 */
export function accountDisplayName(account: AccountDto | null, fallback: string): string {
  if (!account) return fallback
  const person = account.firstName || (account.email ? account.email.split(/[@+]/)[0].replace(/^\w/, (c) => c.toUpperCase()) : null)
  if (account.type === "ADMIN") return account.scopes.find((s) => s.isRoot)?.companyName ?? person ?? fallback
  if (account.type === "BRANCH") {
    return account.scopes.find((s) => !s.isRoot && (s.role === "ADMIN" || s.role === "OWNER"))?.companyName ?? person ?? fallback
  }
  return person ?? fallback
}
