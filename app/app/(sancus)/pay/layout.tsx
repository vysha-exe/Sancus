import type { ReactNode } from "react"
import { PayFlowProvider } from "@/lib/sancus/pay-flow"

export default function PayLayout({ children }: { children: ReactNode }) {
  return <PayFlowProvider>{children}</PayFlowProvider>
}
