import type { Metadata } from "next"
import { SignUpCompanyStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up · Company" }

export default function Page() {
  return <SignUpCompanyStep />
}
