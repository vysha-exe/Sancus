import type { ReactNode } from "react"
import { SignUpProvider } from "@/lib/sancus/sign-up-state"

export default function SignUpLayout({ children }: { children: ReactNode }) {
  return <SignUpProvider>{children}</SignUpProvider>
}
