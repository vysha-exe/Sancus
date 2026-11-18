import type { Metadata } from "next"
import { Suspense } from "react"
import { SignInForm } from "@/components/sancus-ui/sign-in-form"

export const metadata: Metadata = { title: "Sancus · Sign in" }

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}
