"use client"

// Safety net: the first time a signed-in account opens the app (per browser
// session), make sure it has its Arc treasury wallets. Covers every sign-up path
// and accounts created before auto-provisioning existed. Silent: no UI, no errors.
import { useEffect } from "react"

const FLAG = "sancus:treasury-ensured"

export function useEnsureTreasury() {
  useEffect(() => {
    let flagged = false
    try {
      flagged = sessionStorage.getItem(FLAG) === "1"
    } catch {
      /* storage blocked: just check */
    }
    if (flagged) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/sancus/treasury/setup", { cache: "no-store" })
        if (!res.ok) return // signed out / mock mode
        const status = (await res.json()) as { circleConfigured: boolean; treasury: unknown; settlement: unknown }
        if (status.treasury && status.settlement) {
          try {
            sessionStorage.setItem(FLAG, "1")
          } catch {}
          return
        }
        if (!status.circleConfigured || cancelled) return
        const created = await fetch("/api/sancus/treasury/setup", { method: "POST" })
        if (created.ok) {
          try {
            sessionStorage.setItem(FLAG, "1")
          } catch {}
          window.dispatchEvent(new Event("sancus:treasury-ready"))
        }
      } catch {
        /* offline: try again next visit */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
}
