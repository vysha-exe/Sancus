import { redirect } from "next/navigation"

/** Demo entry is retired; send people into the real account flow. */
export default function DemoPage() {
  redirect("/sign-up")
}
