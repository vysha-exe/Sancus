"use client"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import { findNode, type CompanyNode } from "./companies"
import { useCompanies } from "./use-companies"
import { signalSancusDataChanged } from "./live-refresh"
import {
  readAccountMode,
  readCompanyCookie,
  setWorkspaceCompany,
  setWorkspacePersonal,
  type AccountMode,
} from "./workspace"
import { displayMinor, USDC_DECIMALS } from "./money"

function usd(minor: string) {
  return `$${displayMinor(BigInt(minor || "0"), USDC_DECIMALS, "", 2)}`
}

function flatten(nodes: CompanyNode[], out: CompanyNode[] = []) {
  for (const n of nodes) {
    out.push(n)
    flatten(n.children, out)
  }
  return out
}

// ---------- the selected workspace, shared by every screen ----------
// One copy for the whole page: the switcher, Home, Team, Pay… all read it and all re-render when it
// changes. (Each hook used to keep its own copy, so switching only updated the dropdown until a
// reload.) The cookie stays the source of truth for the API; this mirrors it in the browser.

type Selection = { mode: AccountMode; companyId: string | null }

const SERVER_SELECTION: Selection = { mode: "personal", companyId: null }
let selection: Selection | null = null
const listeners = new Set<() => void>()

function readSelection(): Selection {
  const cookieId = readCompanyCookie()
  return cookieId ? { mode: "business", companyId: cookieId } : { mode: readAccountMode(), companyId: null }
}

function getSelection(): Selection {
  return (selection ??= readSelection())
}

function setSelection(next: Selection) {
  const prev = getSelection()
  if (prev.mode === next.mode && prev.companyId === next.companyId) return
  selection = next
  listeners.forEach((listener) => listener())
  // Lists the server scopes by the workspace cookie (activity, regional balances) refetch.
  signalSancusDataChanged()
}

/** Another tab can switch the shared cookie; pick that up when this tab is looked at again. */
function syncFromCookie() {
  if (document.visibilityState === "visible") setSelection(readSelection())
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    window.addEventListener("focus", syncFromCookie)
    document.addEventListener("visibilitychange", syncFromCookie)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window.removeEventListener("focus", syncFromCookie)
      document.removeEventListener("visibilitychange", syncFromCookie)
    }
  }
}

const noopSubscribe = () => () => {}

/** Active Personal vs company-node workspace for the shell. */
export function useWorkspace() {
  const companies = useCompanies()
  const { mode, companyId } = useSyncExternalStore(subscribe, getSelection, () => SERVER_SELECTION)
  // False during server render and hydration, true once the browser's cookie has been read.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)

  // If the cookie points at a node this account can't see, fall back to the first root or personal.
  useEffect(() => {
    if (!companies.ready || !hydrated) return
    if (mode !== "business") return
    if (!companies.hasBusiness) {
      setWorkspacePersonal()
      setSelection({ mode: "personal", companyId: null })
      return
    }
    const all = flatten(companies.tree)
    if (companyId && all.some((n) => n.id === companyId)) return
    const root = companies.tree[0]
    if (root) {
      setWorkspaceCompany(root.id)
      setSelection({ mode: "business", companyId: root.id })
    }
  }, [companies.ready, companies.hasBusiness, companies.tree, companyId, hydrated, mode])

  const activeNode = useMemo(() => {
    if (mode !== "business" || !companyId) return null
    return findNode(companies.tree, companyId)
  }, [mode, companyId, companies.tree])

  const selectPersonal = useCallback(() => {
    setWorkspacePersonal()
    setSelection({ mode: "personal", companyId: null })
  }, [])

  const selectCompany = useCallback((id: string) => {
    setWorkspaceCompany(id)
    setSelection({ mode: "business", companyId: id })
  }, [])

  // Prefer a company name over the word "Personal" when a tree exists (admin demos / sticky localStorage).
  const fallbackCompany = companies.tree[0]?.name ?? "Business"
  const label =
    mode === "personal"
      ? companies.hasBusiness
        ? fallbackCompany
        : "Personal"
      : activeNode
        ? activeNode.name
        : fallbackCompany

  const chipLabel =
    mode === "personal"
      ? companies.hasBusiness
        ? fallbackCompany
        : "Personal"
      : activeNode
        ? activeNode.parentId
          ? `${findNode(companies.tree, activeNode.rootId)?.name ?? "Company"} · ${activeNode.name}`
          : activeNode.name
        : fallbackCompany

  return {
    ready: companies.ready && hydrated,
    balancesReady: companies.balancesReady,
    mode,
    isPersonal: mode === "personal",
    hasBusiness: companies.hasBusiness,
    tree: companies.tree,
    companyId,
    activeNode,
    label,
    chipLabel,
    selectPersonal,
    selectCompany,
    refresh: companies.refresh,
    formatBalance: usd,
  }
}
