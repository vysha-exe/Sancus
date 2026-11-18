import type { Metadata } from "next"
import { SignUpTeamStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up · Team" }

export default function Page() {
  return <SignUpTeamStep />
}
