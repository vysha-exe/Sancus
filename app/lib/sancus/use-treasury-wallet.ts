"use client"

// The signed-in account's personal Arc Treasury wallet + its USDC/EURC balances.
import { useCallback, useEffect, useState } from "react"

export type TreasuryWallet = { walletId: string; address: string }
export type TreasuryBalances = { usdc: number | null; eurc: number | null }

/** "$19.00 (ARC-TESTNET)" / "€21.30 (ARC-TESTNET)" → 19 / 21.3 */
export function parseBalanceLabel(label: unknown): number | null {
  if (typeof label !== "string") return null
  const m = label.replace(/,/g, "").match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : null
}

async function balance(walletId: string, token: "USDC" | "EURC"): Promise<number | null> {
  try {
    const res = await fetch("/api/wallet/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletIds: [walletId], token }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as Record<string, string>
    return parseBalanceLabel(body[walletId])
  } catch {
    return null
  }
}

export function useTreasuryWallet() {
  const [wallet, setWallet] = useState<TreasuryWallet | null>(null)
  const [balances, setBalances] = useState<TreasuryBalances>({ usdc: null, eurc: null })
  const [state, setState] = useState<"loading" | "ready" | "none" | "signed-out">("loading")
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let res = await fetch("/api/sancus/treasury/setup", { cache: "no-store" })
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 1200))
          res = await fetch("/api/sancus/treasury/setup", { cache: "no-store" })
        }
        if (cancelled) return
        if (res.status === 401) return setState("signed-out")
        const body = await res.json()
        const t = body.treasury as { walletId: string; address: string } | null
        if (!t) return setState("none")
        setWallet({ walletId: t.walletId, address: t.address })
        const [usdc, eurc] = await Promise.all([balance(t.walletId, "USDC"), balance(t.walletId, "EURC")])
        if (!cancelled) {
          setBalances({ usdc, eurc })
          setState("ready")
        }
      } catch {
        if (!cancelled) setState("signed-out")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { wallet, balances, state, refresh }
}
