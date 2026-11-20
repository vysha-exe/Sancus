import type { Metadata } from "next"
import type { ReactNode } from "react"
import "@/styles/sancus/sancus.css"
import "@/styles/sancus/cross-rail.css"

export const metadata: Metadata = { title: "Vendor terminal · Sancus sandbox" }

// Mock vendor terminals for the cross-rail demo. Public on purpose: they stand in for a shop's own POS.
export default function TerminalLayout({ children }: { children: ReactNode }) {
  return <div className="xt-shell">{children}</div>
}
