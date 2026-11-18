"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useSancusPrefs } from "@/lib/sancus/prefs"
import { useLiveApprovals } from "@/lib/sancus/use-live-approvals"
import { useEnsureTreasury } from "@/lib/sancus/use-ensure-treasury"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { workspace } from "@/lib/sancus/demo-data"
import {
  IconActivity,
  IconAgents,
  IconCollapse,
  IconHome,
  IconInvoices,
  IconPay,
  IconSearch,
  IconSettings,
  IconSpending,
  IconTeam,
  IconBranches,
} from "./icons"
import { SancusLockup } from "./logo"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { NotificationBell } from "./notification-bell"

const nav = [
  { href: "/home", label: "Home", icon: IconHome, match: (p: string) => p === "/home" || p.startsWith("/home/") },
  { href: "/pay", label: "Pay", icon: IconPay, match: (p: string) => p.startsWith("/pay") },
  {
    href: "/activity",
    label: "Activity",
    icon: IconActivity,
    match: (p: string) => p.startsWith("/activity"),
    count: true,
  },
  { href: "/spending", label: "Spending", icon: IconSpending, match: (p: string) => p.startsWith("/spending") },
  { href: "/branches", label: "Branches", icon: IconBranches, match: (p: string) => p.startsWith("/branches") },
  { href: "/team", label: "Team", icon: IconTeam, match: (p: string) => p.startsWith("/team") },
  { href: "/invoices", label: "Invoices", icon: IconInvoices, match: (p: string) => p.startsWith("/invoices") },
  { href: "/agents", label: "Agents", icon: IconAgents, match: (p: string) => p.startsWith("/agents") },
] as const

export function AppShell({
  children,
  headerExtra,
}: {
  children: ReactNode
  headerExtra?: ReactNode
}) {
  const pathname = usePathname()
  const { collapsed, toggleCollapsed, theme } = useSancusPrefs()
  // Live count of payments waiting for approval (demo count when signed out).
  const approvalCount = useLiveApprovals().waiting.length
  // New accounts get their Arc treasury wallets on first visit (no-op once they exist).
  useEnsureTreasury()
  const ws = useWorkspace()
  // Personal mode (or no company yet): hide Team/Branches. Business selection shows them.
  const showBusinessNav = ws.ready ? !ws.isPersonal && ws.hasBusiness : false
  const navItems = showBusinessNav
    ? nav
    : nav.filter((item) => item.href !== "/team" && item.href !== "/branches")
  const actorRole = ws.isPersonal ? "Personal" : workspace.actor.role

  return (
    <div className="frame">
      <div
        className={`sx shell${collapsed ? " shell--collapsed" : ""}`}
        data-theme={theme}
        // Prefs hydrate from localStorage after mount; avoid a full tree redo.
        suppressHydrationWarning
      >
        <header className="hdr">
          <SancusLockup />
          <div className="bar">
            <WorkspaceSwitcher />
            <label className="search-pill">
              <IconSearch />
              <span className="vh">Search</span>
              <input placeholder="Search payments, people, invoices" />
            </label>
            {headerExtra}
            <span
              className="sx-pill sx-pill--simulated push"
              title="Testnet USDC. Bank, local and card rails are simulated."
            >
              Sandbox
            </span>
            <NotificationBell />
            <button
              type="button"
              className="me"
              aria-label={`Account: ${workspace.actor.firstName}, ${actorRole}`}
            >
              <span className="av">{workspace.actor.initial}</span>
              <span className="me-txt">
                {workspace.actor.firstName}
                <small>{actorRole}</small>
              </span>
            </button>
          </div>
        </header>

        <nav aria-label="Main" className="side">
          <div className="nav">
            {navItems.map((item) => {
              const on = item.match(pathname)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${on ? " nav-item--on" : ""}`}
                  aria-current={on ? "page" : undefined}
                  title={item.label}
                >
                  <Icon />
                  <span className="lbl">{item.label}</span>
                  {"count" in item && approvalCount ? (
                    <span className="count" aria-label={`${approvalCount} waiting for approval`}>
                      {approvalCount}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
          <div className="side-foot">
            <Link
              href="/settings"
              className={`nav-item${pathname.startsWith("/settings") ? " nav-item--on" : ""}`}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              title="Settings"
            >
              <IconSettings />
              <span className="lbl">Settings</span>
            </Link>
            <button
              type="button"
              className="nav-item side-collapse"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={collapsed}
              onClick={toggleCollapsed}
            >
              <IconCollapse />
              <span className="lbl">{collapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>
        </nav>

        <main className="main">{children}</main>
      </div>
    </div>
  )
}
