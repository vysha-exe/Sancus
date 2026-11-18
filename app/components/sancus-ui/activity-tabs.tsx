import Link from "next/link"

export function ActivityTabs({
  active,
  approvalCount,
}: {
  active: "all" | "approvals"
  approvalCount: number
}) {
  return (
    <nav className="tabs" aria-label="Activity sections">
      <Link
        href="/activity"
        className={`tab${active === "all" ? " tab--on" : ""}`}
        aria-current={active === "all" ? "page" : undefined}
      >
        All activity
      </Link>
      <Link
        href="/activity/approvals"
        className={`tab${active === "approvals" ? " tab--on" : ""}`}
        aria-current={active === "approvals" ? "page" : undefined}
      >
        Approvals <span className="count">{approvalCount}</span>
      </Link>
    </nav>
  )
}
