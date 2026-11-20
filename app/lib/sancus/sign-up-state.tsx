"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

/** Sign-up answers, carried across the steps by the /sign-up layout (kept in memory only). */
export type AccountType = "personal" | "business"

export type SignUpData = {
  firstName: string
  email: string
  /** Set on step 1 so password sign-in works after OTP verify. */
  password: string
  agreed: boolean
  accountType: AccountType
  /** Full legal name for personal accounts (wireframe “About you”). */
  fullName: string
  company: string
  country: string
  currency: string
  invites: { email: string; role: string }[]
  /** How many invites the user sent on the team step (0 if skipped). */
  invitesSent: number
  /** Set after business onboarding creates the company. */
  createdCompanyId: string | null
  provisioningError: string | null
}

export const SIGN_UP_DEFAULTS: SignUpData = {
  firstName: "",
  email: "",
  password: "",
  agreed: false,
  accountType: "business",
  fullName: "",
  company: "",
  country: "United States",
  currency: "USD",
  invites: [
    { email: "", role: "Employee" },
    { email: "", role: "Employee" },
    { email: "", role: "Employee" },
  ],
  invitesSent: 0,
  createdCompanyId: null,
  provisioningError: null,
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
