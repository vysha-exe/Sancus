"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"
import { applyCompanyBalances, type CompanyBalanceSnapshot, type CompanyNode } from "./companies"

type Me = {
  tree: CompanyNode[]
  nodeCount: number
  walletCount: number
  circleConfigured: boolean
}

type Store = { me: Me | null; ready: boolean; balancesReady: boolean }

const STRUCTURE_FRESH_FOR_MS = 5 * 60_000
const BALANCES_FRESH_FOR_MS = 20_000
const serverSnapshot: Store = { me: null, ready: false, balancesReady: false }
let store: Store = serverSnapshot
let structureCachedAt = 0
let balancesCachedAt = 0
let companiesRequest: Promise<Me | null> | null = null
let balancesRequest: Promise<Me | null> | null = null
let lastBalanceSnapshot: CompanyBalanceSnapshot | null = null
let generation = 0
const listeners = new Set<() => void>()

function publish(next: Store) {
  store = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return store
}

export function loadCompanies(force = false, now = Date.now()) {
  if (!force && store.ready && now - structureCachedAt < STRUCTURE_FRESH_FOR_MS) {
    return Promise.resolve(store.me)
  }
  if (!companiesRequest) {
    const requestGeneration = generation
    const request = fetch("/api/sancus/companies/me", { cache: "no-store" })
      .then(async (res) => {
        if (requestGeneration !== generation) return store.me
        if (!res.ok) {
          if (!store.ready) publish({ me: null, ready: true, balancesReady: false })
          return store.me
        }
        const body = (await res.json()) as Me
        const structure = {
          tree: body.tree ?? [],
          nodeCount: body.nodeCount ?? 0,
          walletCount: body.walletCount ?? 0,
          circleConfigured: Boolean(body.circleConfigured),
        }
        const me = lastBalanceSnapshot
          ? { ...structure, tree: applyCompanyBalances(structure.tree, lastBalanceSnapshot) }
          : structure
        structureCachedAt = now
        balancesCachedAt = 0
        publish({ me, ready: true, balancesReady: Boolean(lastBalanceSnapshot) })
        return me
      })
      .catch(() => {
        if (requestGeneration === generation && !store.ready) {
          publish({ me: null, ready: true, balancesReady: false })
        }
        return store.me
      })
      .finally(() => {
        if (companiesRequest === request) companiesRequest = null
      })
    companiesRequest = request
  }
  return companiesRequest
}

/** Loads volatile wallet balances after the structure is already visible. */
export function loadCompanyBalances(force = false, now = Date.now()) {
  if (!store.me) return Promise.resolve(null)
  if (!force && balancesCachedAt > 0 && now - balancesCachedAt < BALANCES_FRESH_FOR_MS) {
    return Promise.resolve(store.me)
  }
  if (!balancesRequest) {
    const requestGeneration = generation
    const request = fetch("/api/sancus/companies/balances", { cache: "no-store" })
      .then(async (res) => {
        if (requestGeneration !== generation || !res.ok || !store.me) return store.me
        const snapshot = (await res.json()) as CompanyBalanceSnapshot
        lastBalanceSnapshot = snapshot
        const me = { ...store.me, tree: applyCompanyBalances(store.me.tree, snapshot) }
        balancesCachedAt = now
        publish({ me, ready: true, balancesReady: true })
        return me
      })
      .catch(() => store.me)
      .finally(() => {
        if (balancesRequest === request) balancesRequest = null
      })
    balancesRequest = request
  }
  return balancesRequest
}

export function resetCompaniesCache() {
  generation += 1
  structureCachedAt = 0
  balancesCachedAt = 0
  companiesRequest = null
  balancesRequest = null
  lastBalanceSnapshot = null
  publish(serverSnapshot)
}

/** Loads company trees for shell gating (personal vs business chrome). */
export function useCompanies() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)

  const refresh = useCallback(async () => {
    await loadCompanies(true)
    await loadCompanyBalances(true)
  }, [])

  useEffect(() => {
    void loadCompanies().then(() => loadCompanyBalances())
  }, [])

  return {
    ready: state.ready,
    balancesReady: state.balancesReady,
    hasBusiness: (state.me?.nodeCount ?? 0) > 0,
    tree: state.me?.tree ?? [],
    walletCount: state.me?.walletCount ?? 0,
    circleConfigured: state.me?.circleConfigured ?? false,
    refresh,
  }
}
