"use client"

import { useCallback, useEffect, useState } from "react"
import type { CompanyNode } from "./companies"

type Me = { tree: CompanyNode[]; nodeCount: number }

/** Loads company trees for shell gating (personal vs business chrome). */
export function useCompanies() {
  const [me, setMe] = useState<Me | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/companies/me", { cache: "no-store" })
      if (!res.ok) {
        setMe(null)
        setReady(true)
        return
      }
      const body = (await res.json()) as Me
      setMe({ tree: body.tree ?? [], nodeCount: body.nodeCount ?? 0 })
    } catch {
      setMe(null)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    ready,
    hasBusiness: (me?.nodeCount ?? 0) > 0,
    tree: me?.tree ?? [],
    refresh,
  }
}
