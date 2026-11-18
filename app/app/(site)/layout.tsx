import type { ReactNode } from "react"
import { SiteShell } from "@/components/sancus-ui/site-shell"
import "@/styles/sancus/sancus.css"

/** Public marketing pages (/, /pricing, /security) share the strip, nav and footer. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
