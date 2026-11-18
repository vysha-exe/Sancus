import { redirect } from "next/navigation"

/** Onboarding moved into the sign-up flow (step 3 is the company screen). */
export default function OnboardingRedirect() {
  redirect("/sign-up")
}
