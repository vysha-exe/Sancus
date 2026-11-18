import type { Metadata } from "next"
import { SignUpDoneStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up · Done" }

export default function Page() {
  return <SignUpDoneStep />
}
