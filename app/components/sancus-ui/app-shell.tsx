"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { ACCOUNT_TYPE_LABEL, navWithDevQa, type NavKey } from "@/lib/sancus/accounts"
import { accountDisplayName, can, canOpenPath, useAccount } from "@/lib/sancus/use-account"
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
  IconDevQa,
} from "./icons"
import { SancusLockup } from "./logo"
import { AccountMenu } from "./account-menu"
import { WorkspaceSwitcher } from "./workspace-switcher"
import { NotificationBell } from "./notification-bell"
import { AgentCallButton } from "./agent-call"

const nav = [
  { key: "home", href: "/home", label: "Home", icon: IconHome, match: (p: string) => p === "/home" || p.startsWith("/home/") },
  { key: "branch", href: "/branch", label: "My branch", icon: IconHome, match: (p: string) => p === "/branch" || p.startsWith("/branch/") },
  { key: "me", href: "/me", label: "My card", icon: IconSpending, match: (p: string) => p === "/me" || p.startsWith("/me/") },
  { key: "pay", href: "/pay", label: "Pay", icon: IconPay, match: (p: string) => p.startsWith("/pay") },
  { key: "receive", href: "/receive", label: "Receive", icon: IconInvoices, match: (p: string) => p.startsWith("/receive") },
  {
    key: "activity",
    href: "/activity",
    label: "Activity",
    icon: IconActivity,
    match: (p: string) => p.startsWith("/activity"),
    count: true,
  },
  { key: "spending", href: "/spending", label: "Spending", icon: IconSpending, match: (p: string) => p.startsWith("/spending") },
  { key: "branches", href: "/branches", label: "Branches", icon: IconBranches, match: (p: string) => p.startsWith("/branches") },
  { key: "team", href: "/team", label: "Team", icon: IconTeam, match: (p: string) => p.startsWith("/team") },
  { key: "invoices", href: "/invoices", label: "Invoices", icon: IconInvoices, match: (p: string) => p.startsWith("/invoices") },
  { key: "agents", href: "/agents", label: "Agents", icon: IconAgents, match: (p: string) => p.startsWith("/agents") },
  { key: "devqa", href: "/dev", label: "Dev", icon: IconDevQa, match: (p: string) => p.startsWith("/dev") },
] as const

/** The admin's classic set, used for the guest demo before an account loads. */
const DEFAULT_NAV: NavKey[] = ["home", "pay", "activity", "spending", "branches", "team", "invoices", "agents"]

export function AppShell({
  children,
  headerExtra,
}: {
  children: ReactNode
  headerExtra?: ReactNode
}) {
  const pathname = usePathname()
  const [pendingTransition, setPendingTransition] = useState<{ from: string; to: string } | null>(null)
  const pendingRoute = pendingTransition?.from === pathname ? pendingTransition.to : null
  const { collapsed, toggleCollapsed, theme } = useSancusPrefs()
  // Live count of payments waiting for approval (demo count when signed out).
  const approvalCount = useLiveApprovals().waiting.length
  const router = useRouter()
  const { account, ready: accountReady } = useAccount()
  // Accounts that hold money get their Arc treasury wallets on first visit (no-op once they exist).
  useEnsureTreasury(accountReady && can(account, "money.send"))
  const ws = useWorkspace()
  // Personal mode (or no company yet): hide Team/Branches. Business selection shows them.
  const showBusinessNav = ws.ready ? !ws.isPersonal && ws.hasBusiness : false
  // Each account type gets its own sections (see lib/sancus/accounts.ts).
  const keys: NavKey[] = navWithDevQa(account?.nav ?? DEFAULT_NAV).filter(
    (k) => k !== "settings" && (account?.type === "BRANCH" || showBusinessNav || (k !== "team" && k !== "branches"))
  )
  const navItems = keys.map((k) => nav.find((n) => n.key === k)).filter((n): n is (typeof nav)[number] => Boolean(n))
  // Primary line is the account type (Business admin, Branch admin, …). Secondary is company or person.
  // Guest demo (no account) is the business-admin demo.
  const actorName = account ? ACCOUNT_TYPE_LABEL[account.type] : ACCOUNT_TYPE_LABEL.ADMIN
  const actorRole = accountDisplayName(account, workspace.name)

  // A business admin always works in the company (there's no personal account on the admin dashboard).
  useEffect(() => {
    if (account?.type !== "ADMIN" || !ws.ready || !ws.isPersonal || !ws.hasBusiness) return
    const root = account.scopes.find((s) => s.isRoot)
    if (root) ws.selectCompany(root.companyId)
  }, [account, ws])

  // Pages outside this account's reach send it home (the APIs refuse them regardless).
  useEffect(() => {
    if (account && !canOpenPath(account, pathname)) router.replace(account.homePath)
  }, [account, pathname, router])

  useEffect(() => {
    if (!pendingRoute) return
    const timeout = window.setTimeout(() => setPendingTransition(null), 10_000)
    return () => window.clearTimeout(timeout)
  }, [pendingRoute])

  function beginLinkTransition(event: MouseEvent<HTMLDivElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return

    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]")
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return

    const destination = new URL(anchor.href, window.location.href)
    if (destination.origin !== window.location.origin) return
    if (destination.pathname === window.location.pathname) return

    setPendingTransition({ from: pathname, to: destination.pathname })
  }

  return (
    <div className="frame">
      <div
        className={`sx shell${collapsed ? " shell--collapsed" : ""}`}
        data-theme={theme}
        onClickCapture={beginLinkTransition}
        // Prefs hydrate from localStorage after mount; avoid a full tree redo.
        suppressHydrationWarning
      >
        <header className="hdr">
          <SancusLockup />
          <div className="bar">
            {!account || account.type === "ADMIN" ? <WorkspaceSwitcher allowPersonal={account?.type !== "ADMIN"} /> : null}
            <label className="search-pill">
              <IconSearch />
              <span className="vh">Search</span>
              <input placeholder="Search payments, people, invoices" />
            </label>
            {headerExtra}
            <div className="hdr-end push">
              {can(account, "agent.use") ? <AgentCallButton /> : null}
              <NotificationBell />
              <AccountMenu name={actorName} role={actorRole} email={account?.email ?? null} signedIn={Boolean(account)} />
            </div>
          </div>
        </header>

        <nav aria-label="Main" className="side">
          <div className="nav">
            {navItems.map((item) => {
              const on = item.match(pathname)
              const pending = pendingRoute ? item.match(pendingRoute) : false
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item${on ? " nav-item--on" : ""}${pending ? " nav-item--pending" : ""}`}
                  aria-current={on ? "page" : undefined}
                  aria-busy={pending || undefined}
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
              className={`nav-item${pathname.startsWith("/settings") ? " nav-item--on" : ""}${pendingRoute?.startsWith("/settings") ? " nav-item--pending" : ""}`}
              aria-current={pathname.startsWith("/settings") ? "page" : undefined}
              aria-busy={pendingRoute?.startsWith("/settings") || undefined}
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

        <main className="main" aria-busy={Boolean(pendingRoute)}>
          {children}
          {pendingRoute ? <RouteTransition /> : null}
        </main>
      </div>
    </div>
  )
}

export function RouteTransition() {
  return (
    <div className="route-transition" role="status" aria-live="polite" aria-label="Loading page">
      <div className="route-transition__bar" aria-hidden="true" />
      <div className="route-transition__card">
        <span className="route-transition__mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="route-transition__copy">
          <b>Opening page</b>
          <small>Getting the latest information…</small>
        </span>
      </div>
    </div>
  )
}
