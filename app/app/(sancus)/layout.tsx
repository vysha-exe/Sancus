import type { ReactNode } from "react"
import { AppShell } from "@/components/sancus-ui/app-shell"
import { SancusPrefsProvider } from "@/lib/sancus/prefs"
import "@/styles/sancus/sancus.css"

export default function SancusLayout({ children }: { children: ReactNode }) {
  return (
    <SancusPrefsProvider>
      <AppShell>{children}</AppShell>
    </SancusPrefsProvider>
  )
}
