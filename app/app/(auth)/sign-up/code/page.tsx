import type { Metadata } from "next"
import { SignUpCodeStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up · Code" }

export default function Page() {
  return <SignUpCodeStep />
}
