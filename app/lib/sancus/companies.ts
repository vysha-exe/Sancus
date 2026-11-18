// Sancus: global account → branches → sub-branches.
// Pure helpers (shared by API and UI): tree building, effective role, capabilities.
// The database enforces the same rules (sancus_effective_role / sancus_create_company).

export type Role = "OWNER" | "ADMIN" | "FINANCE" | "EMPLOYEE" | "VIEWER"

export type CompanyRow = {
  id: string
  parent_id: string | null
  root_id: string
  name: string
  country: string
  base_currency: string
  created_at: string
}

export type MembershipRow = { company_id: string; user_id: string | null; role: Role; status: string }

export type CompanyWallet = {
  walletId: string
  name: string
  address: string
  blockchain: string
  companyId: string
  usdcMinor: string | null
  /** Mock local stablecoins held (mIDR / mTHB / mBRL), non-zero only, minor units. */
  local?: Partial<Record<"BRL" | "IDR" | "THB", string>>
}

export type CompanyNode = {
  id: string
  parentId: string | null
  rootId: string
  name: string
  country: string
  currency: string
  depth: number
  /** Role here, inherited from the nearest ancestor if not set on this node. */
  role: Role | null
  /** True when the role comes from an ancestor rather than this node. */
  roleInherited: boolean
  can: Capabilities
  wallets: CompanyWallet[]
  /** USDC across this node's wallets (minor units, 6 decimals). */
  ownMinor: string
  /** USDC across this node and every descendant. */
  totalMinor: string
  children: CompanyNode[]
}

export type Capabilities = {
  pay: boolean
  approve: boolean
  editPolicies: boolean
  invite: boolean
  createBranch: boolean
  createWallet: boolean
}

const NONE: Capabilities = { pay: false, approve: false, editPolicies: false, invite: false, createBranch: false, createWallet: false }

/** Capability matrix from docs/b2b-b2c-structure.md. */
export function capabilities(role: Role | null): Capabilities {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return { pay: true, approve: true, editPolicies: true, invite: true, createBranch: true, createWallet: true }
    case "FINANCE":
      return { ...NONE, pay: true, approve: true }
    case "EMPLOYEE":
      return { ...NONE, pay: true }
    default:
      return NONE
  }
}

/** Effective role of `userId` at `companyId`: own membership wins, else nearest ancestor's. */
export function effectiveRole(
  companies: CompanyRow[],
  memberships: MembershipRow[],
  userId: string,
  companyId: string
): { role: Role | null; inherited: boolean } {
  const byId = new Map(companies.map((c) => [c.id, c]))
  let node = byId.get(companyId)
  let depth = 0
  while (node && depth < 20) {
    const m = memberships.find((x) => x.company_id === node!.id && x.user_id === userId && x.status === "ACTIVE")
    // INVITED rows have user_id null until accepted — ignore them for effective role.
    if (m) return { role: m.role, inherited: depth > 0 }
    node = node.parent_id ? byId.get(node.parent_id) : undefined
    depth++
  }
  return { role: null, inherited: false }
}

/** Builds the tree(s) with roles, wallets and rolled-up balances. Roots first by creation time. */
export function buildCompanyTree(
  companies: CompanyRow[],
  memberships: MembershipRow[],
  wallets: CompanyWallet[],
  userId: string
): CompanyNode[] {
  const childrenOf = new Map<string | null, CompanyRow[]>()
  for (const c of [...companies].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = c.parent_id && companies.some((p) => p.id === c.parent_id) ? c.parent_id : null
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), c])
  }

  const build = (c: CompanyRow, depth: number): CompanyNode => {
    const { role, inherited } = effectiveRole(companies, memberships, userId, c.id)
    const own = wallets.filter((w) => w.companyId === c.id)
    const ownMinor = own.reduce((s, w) => s + (w.usdcMinor ? BigInt(w.usdcMinor) : 0n), 0n)
    const children = (childrenOf.get(c.id) ?? []).map((k) => build(k, depth + 1))
    const totalMinor = children.reduce((s, k) => s + BigInt(k.totalMinor), ownMinor)
    return {
      id: c.id,
      parentId: c.parent_id,
      rootId: c.root_id,
      name: c.name,
      country: c.country,
      currency: c.base_currency,
      depth,
      role,
      roleInherited: inherited,
      can: capabilities(role),
      wallets: own,
      ownMinor: ownMinor.toString(),
      totalMinor: totalMinor.toString(),
      children,
    }
  }

  return (childrenOf.get(null) ?? []).map((c) => build(c, 0))
}

export function countNodes(nodes: CompanyNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countNodes(x.children), 0)
}

export function findNode(nodes: CompanyNode[], id: string): CompanyNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findNode(n.children, id)
    if (hit) return hit
  }
  return null
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  FINANCE: "Finance",
  EMPLOYEE: "Employee",
  VIEWER: "Viewer",
}
