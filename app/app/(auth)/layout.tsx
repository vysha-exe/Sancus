import type { ReactNode } from "react"
import "@/styles/sancus/sancus.css"

/** Mock sign-in and sign-up. Separate from the Supabase forms under /auth. */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
