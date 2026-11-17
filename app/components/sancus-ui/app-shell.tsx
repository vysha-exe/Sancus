"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { approvals } from "@/lib/sancus/demo-data"
import { useSancusPrefs } from "@/lib/sancus/prefs"
import { workspace } from "@/lib/sancus/demo-data"
import {
  IconActivity,
  IconAgents,
  IconBell,
  IconChevron,
  IconCollapse,
  IconHome,
  IconInvoices,
  IconPay,
  IconSearch,
  IconSettings,
  IconSpending,
  IconTeam,
} from "./icons"
import { SancusLockup } from "./logo"

const nav = [
  { href: "/home", label: "Home", icon: IconHome, match: (p: string) => p === "/home" || p.startsWith("/home/") },
  { href: "/pay", label: "Pay", icon: IconPay, match: (p: string) => p.startsWith("/pay") },
  {
    href: "/activity",
    label: "Activity",
    icon: IconActivity,
    match: (p: string) => p.startsWith("/activity"),
    count: approvals.length,
  },
  { href: "/spending", label: "Spending", icon: IconSpending, match: (p: string) => p.startsWith("/spending") },
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

  return (
    <div className="frame">
      <div
        className={`sx shell${collapsed ? " shell--collapsed" : ""}`}
        data-theme={theme}
      >
        <header className="hdr">
          <SancusLockup />
          <div className="bar">
            <button type="button" className="ws-chip" aria-label="Switch workspace">
              {workspace.name}
              <IconChevron />
            </button>
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
            <button type="button" className="icon-btn" aria-label="Notifications, 3 new">
              <IconBell />
              <b />
            </button>
            <button
              type="button"
              className="me"
              aria-label={`Account: ${workspace.actor.firstName}, ${workspace.actor.role}`}
            >
              <span className="av">{workspace.actor.initial}</span>
              <span className="me-txt">
                {workspace.actor.firstName}
                <small>{workspace.actor.role}</small>
              </span>
            </button>
          </div>
        </header>

        <nav aria-label="Main" className="side">
          <div className="nav">
            {nav.map((item) => {
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
                  {"count" in item && item.count ? (
                    <span className="count" aria-label={`${item.count} waiting for approval`}>
                      {item.count}
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
