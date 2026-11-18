"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { findNode, type CompanyNode } from "./companies"
import { useCompanies } from "./use-companies"
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

/** Active Personal vs company-node workspace for the shell. */
export function useWorkspace() {
  const companies = useCompanies()
  const [mode, setMode] = useState<AccountMode>("personal")
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const cookieId = readCompanyCookie()
    const storedMode = readAccountMode()
    if (cookieId) {
      setCompanyId(cookieId)
      setMode("business")
    } else {
      setMode(storedMode)
      setCompanyId(null)
    }
    setHydrated(true)
  }, [])

  // If cookie points at a missing node, fall back to first root or personal.
  useEffect(() => {
    if (!companies.ready || !hydrated) return
    if (mode !== "business") return
    if (!companies.hasBusiness) {
      setWorkspacePersonal()
      setMode("personal")
      setCompanyId(null)
      return
    }
    const all = flatten(companies.tree)
    if (companyId && all.some((n) => n.id === companyId)) return
    const root = companies.tree[0]
    if (root) {
      setWorkspaceCompany(root.id)
      setCompanyId(root.id)
    }
  }, [companies.ready, companies.hasBusiness, companies.tree, companyId, hydrated, mode])

  const activeNode = useMemo(() => {
    if (mode !== "business" || !companyId) return null
    return findNode(companies.tree, companyId)
  }, [mode, companyId, companies.tree])

  const selectPersonal = useCallback(() => {
    setWorkspacePersonal()
    setMode("personal")
    setCompanyId(null)
  }, [])

  const selectCompany = useCallback((id: string) => {
    setWorkspaceCompany(id)
    setMode("business")
    setCompanyId(id)
  }, [])

  const label =
    mode === "personal"
      ? "Personal"
      : activeNode
        ? activeNode.parentId
          ? `${activeNode.name}`
          : activeNode.name
        : "Business"

  const chipLabel =
    mode === "personal"
      ? "Personal"
      : activeNode
        ? activeNode.parentId
          ? `${findNode(companies.tree, activeNode.rootId)?.name ?? "Company"} · ${activeNode.name}`
          : activeNode.name
        : "Business"

  return {
    ready: companies.ready && hydrated,
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
