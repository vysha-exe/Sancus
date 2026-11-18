"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

export type SiteNavKey = "product" | "pricing" | "security"

const NAV: { key: SiteNavKey; href: string; label: string }[] = [
  { key: "product", href: "/", label: "Product" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
  { key: "security", href: "/security", label: "Security" },
]

function keyForPath(pathname: string): SiteNavKey | undefined {
  if (pathname === "/") return "product"
  if (pathname.startsWith("/pricing")) return "pricing"
  if (pathname.startsWith("/security")) return "security"
  return undefined
}

/** Top-nav links. Uses the `active` key when given, otherwise the current path. */
export function SiteNavLinks({ active }: { active?: SiteNavKey }) {
  const pathname = usePathname()
  const current = active ?? keyForPath(pathname)
  return (
    <div className="snav-links">
      {NAV.map((n) => (
        <Link key={n.key} href={n.href} aria-current={current === n.key ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </div>
  )
}
