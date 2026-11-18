import type { Metadata } from "next"
import { SignUpEmailStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up" }

export default function Page() {
  return <SignUpEmailStep />
}
