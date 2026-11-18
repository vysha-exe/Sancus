import type { Metadata } from "next"
import { DemoPicker } from "@/components/sancus-ui/demo-picker"

export const metadata: Metadata = { title: "Sancus · Try the demo" }

export default function DemoPage() {
  return <DemoPicker />
}
