"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

/** Mock sign-up answers, carried across the five steps by the /sign-up layout (kept in memory only). Defaults follow the wireframes (Café Paulista demo). */
export type SignUpData = {
  firstName: string
  email: string
  agreed: boolean
  company: string
  country: string
  currency: string
  invites: { email: string; role: string }[]
  /** How many invites the user sent on the team step (0 if skipped). */
  invitesSent: number
}

export const SIGN_UP_DEFAULTS: SignUpData = {
  firstName: "Maya",
  email: "maya@cafepaulista.com.br",
  agreed: true,
  company: "Café Paulista Ltda",
  country: "Brazil",
  currency: "BRL",
  invites: [
    { email: "rafael@cafepaulista.com.br", role: "Finance" },
    { email: "ana@cafepaulista.com.br", role: "Employee" },
    { email: "", role: "Employee" },
  ],
  invitesSent: 0,
}

type Ctx = {
  data: SignUpData
  update: (patch: Partial<SignUpData>) => void
}

const SignUpContext = createContext<Ctx | null>(null)

export function SignUpProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SignUpData>(SIGN_UP_DEFAULTS)
  const update = useCallback((patch: Partial<SignUpData>) => setData((d) => ({ ...d, ...patch })), [])
  const value = useMemo(() => ({ data, update }), [data, update])

  return <SignUpContext.Provider value={value}>{children}</SignUpContext.Provider>
}

export function useSignUp(): Ctx {
  const ctx = useContext(SignUpContext)
  if (!ctx) throw new Error("useSignUp must be used inside <SignUpProvider>")
  return ctx
}

export function validInviteCount(invites: SignUpData["invites"]): number {
  return invites.filter((i) => /^\S+@\S+\.\S+$/.test(i.email.trim())).length
}
