"use client"

import { useCallback, useEffect, useState } from "react"
import type { CompanyNode } from "./companies"

type Me = { tree: CompanyNode[]; nodeCount: number }

let cachedCompanies: Me | null = null
let companiesRequest: Promise<Me | null> | null = null

function fetchCompanies() {
  if (!companiesRequest) {
    companiesRequest = fetch("/api/sancus/companies/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null
        const body = (await res.json()) as Me
        cachedCompanies = { tree: body.tree ?? [], nodeCount: body.nodeCount ?? 0 }
        return cachedCompanies
      })
      .catch(() => null)
      .finally(() => { companiesRequest = null })
  }
  return companiesRequest
}

/** Loads company trees for shell gating (personal vs business chrome). */
export function useCompanies() {
  const [me, setMe] = useState<Me | null>(cachedCompanies)
  const [ready, setReady] = useState(cachedCompanies !== null)

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCompanies()
      if (next) setMe(next)
    } catch {
      // Keep the last confirmed workspace visible if a background refresh fails.
    }
    setReady(true)
  }, [])

  useEffect(() => {
    // Initial/background server sync; state changes after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  return {
    ready,
    hasBusiness: (me?.nodeCount ?? 0) > 0,
    tree: me?.tree ?? [],
    refresh,
  }
}
