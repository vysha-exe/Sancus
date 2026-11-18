"use client"

// Safety net: the first time a signed-in account opens the app (per browser
// session), make sure it has its Arc treasury wallets. Covers every sign-up path
// and accounts created before auto-provisioning existed. Silent: no UI, no errors.
// Deferred so first-paint APIs (balance, companies, approvals) win the compile/network race.
import { useEffect } from "react"

const FLAG = "sancus:treasury-ensured"

function whenIdle(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const ric = window.requestIdleCallback?.bind(window)
  if (ric) {
    const id = ric(() => cb(), { timeout: 2500 })
    return () => window.cancelIdleCallback?.(id)
  }
  const t = window.setTimeout(cb, 400)
  return () => window.clearTimeout(t)
}

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
    const cancelIdle = whenIdle(() => {
      if (cancelled) return
      void (async () => {
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
    })

    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [])
}
