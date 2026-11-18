"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { CompanyNode } from "@/lib/sancus/companies"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { IconChevron } from "./icons"
import { workspace } from "@/lib/sancus/demo-data"

function TreeNodes({
  nodes,
  activeId,
  onSelect,
  formatBalance,
  depth = 0,
}: {
  nodes: CompanyNode[]
  activeId: string | null
  onSelect: (id: string) => void
  formatBalance: (minor: string) => string
  depth?: number
}) {
  return (
    <ul className="tree" style={depth === 0 ? undefined : { margin: 0, paddingLeft: 12, listStyle: "none" }}>
      {nodes.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            className={`node${activeId === n.id ? " node--on" : ""}`}
            role="menuitem"
            aria-current={activeId === n.id ? "true" : undefined}
            onClick={() => onSelect(n.id)}
            style={{ width: "100%", textAlign: "left", font: "inherit", border: 0, background: "transparent", cursor: "pointer" }}
          >
            <span className="trunc" style={{ paddingLeft: depth * 8 }}>
              {n.name}
            </span>
            <span className="amt">{formatBalance(n.totalMinor)}</span>
          </button>
          {n.children.length > 0 ? (
            <TreeNodes
              nodes={n.children}
              activeId={activeId}
              onSelect={onSelect}
              formatBalance={formatBalance}
              depth={depth + 1}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** Header chip + menu matching WorkspaceSwitcher.dc.html. */
export function WorkspaceSwitcher() {
  const ws = useWorkspace()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  return (
    <div className="ws-menu" ref={ref}>
      <button
        type="button"
        className="ws-chip"
        aria-label="Switch workspace"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {ws.chipLabel}
        <IconChevron />
      </button>
      {open ? (
        <div className="menu" role="menu" aria-label="Workspaces">
          <span className="sx-label">Personal</span>
          <button
            type="button"
            className={`node${ws.isPersonal ? " node--on" : ""}`}
            role="menuitem"
            aria-current={ws.isPersonal ? "true" : undefined}
            onClick={() => {
              ws.selectPersonal()
              setOpen(false)
            }}
            style={{ width: "100%", textAlign: "left", font: "inherit", border: 0, background: "transparent", cursor: "pointer" }}
          >
            <span className="trunc">{workspace.actor.firstName}</span>
            <span className="amt">Personal</span>
          </button>
          {ws.hasBusiness ? (
            <>
              <hr />
              <span className="sx-label">
                Companies · {ws.tree.length} {ws.tree.length === 1 ? "tree" : "trees"}
              </span>
              <TreeNodes
                nodes={ws.tree}
                activeId={ws.isPersonal ? null : ws.companyId}
                formatBalance={ws.formatBalance}
                onSelect={(id) => {
                  ws.selectCompany(id)
                  setOpen(false)
                }}
              />
            </>
          ) : null}
          <hr />
          <Link
            href="/branches"
            className="sx-btn sx-btn--quiet"
            role="menuitem"
            style={{ justifyContent: "flex-start" }}
            onClick={() => setOpen(false)}
          >
            {ws.hasBusiness ? "Manage branches" : "Open a business"}
          </Link>
        </div>
      ) : null}
    </div>
  )
}
