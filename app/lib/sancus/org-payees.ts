// Other companies in the org as Pay payees (admin → branches, branch → sibling branches).
import { countryByCode } from "@/lib/sancus/countries"
import type { CompanyNode } from "@/lib/sancus/companies"
import type { Recipient } from "@/lib/sancus/demo-data"

export const ORG_PAYEE_PREFIX = "org:"

export function isOrgPayeeId(id: string): boolean {
  return id.startsWith(ORG_PAYEE_PREFIX)
}

export function companyIdFromOrgPayee(id: string): string | null {
  if (!isOrgPayeeId(id)) return null
  const companyId = id.slice(ORG_PAYEE_PREFIX.length)
  return /^[0-9a-f-]{36}$/i.test(companyId) ? companyId : null
}

function flatten(nodes: CompanyNode[], out: CompanyNode[] = []) {
  for (const n of nodes) {
    out.push(n)
    flatten(n.children, out)
  }
  return out
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
  return name.slice(0, 2).toUpperCase() || "CO"
}

/** Every other company in the visible tree, as internal USDC payees. */
export function orgCompaniesAsRecipients(
  tree: CompanyNode[],
  opts: { excludeCompanyId?: string | null } = {}
): Recipient[] {
  const exclude = opts.excludeCompanyId ?? null
  return flatten(tree)
    .filter((n) => n.id !== exclude)
    .map((n) => {
      const hq = n.parentId === null
      const place = countryByCode(n.country)?.name ?? n.country
      return {
        id: `${ORG_PAYEE_PREFIX}${n.id}`,
        companyId: n.id,
        name: n.name,
        initials: initials(n.name),
        kind: hq ? "HQ" : "Branch",
        detail: `${hq ? "Global account" : "Branch"} · ${place} · Internal USDC`,
        rail: "Internal",
        country: place,
        methods: [{ rail: "Internal", detail: "Arc transfer within your company", tag: "Org" }],
        history: "Move money between your companies",
      }
    })
}
