"use client"

import { useCallback, useEffect, useState } from "react"
import { SANCUS_DATA_CHANGED } from "./live-refresh"
import type { RegionalBalanceDto } from "./regional-balance"

export function useRegionalBalance() {
  const [balance, setBalance] = useState<RegionalBalanceDto | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/sancus/regional-balance", { cache: "no-store" })
      const body = (await response.json()) as { balance?: RegionalBalanceDto }
      if (response.ok && body.balance) setBalance(body.balance)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    window.addEventListener(SANCUS_DATA_CHANGED, refresh)
    return () => window.removeEventListener(SANCUS_DATA_CHANGED, refresh)
  }, [refresh])

  return { balance, loading, refresh }
}
