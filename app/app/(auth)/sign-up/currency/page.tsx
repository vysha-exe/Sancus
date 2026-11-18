import type { Metadata } from "next"
import { SignUpCurrencyStep } from "@/components/sancus-ui/sign-up-steps"

export const metadata: Metadata = { title: "Sancus · Sign up · Currency" }

export default function Page() {
  return <SignUpCurrencyStep />
}
