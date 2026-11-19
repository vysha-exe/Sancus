// Sancus: account types. Who you are decides what you can see and do.
//
//   AdminAccount       Owner/Admin of a global account (the root). Everything, across every branch.
//   BranchAccount      Admin of a branch (a non-root node). Manages its own employees only, never
//                      the global account or other branches. Can collect money into its branch.
//   EmployeeAccount    Employee anywhere in a company. Sees their virtual card, spending limits and
//                      agent. Can request a payment, which always waits for an admin to approve it.
//   IndividualAccount  A person with no business. Personal balance: send, receive, convert.
//
// Pure (no I/O): built from the company rows the user can see plus their own memberships, so the
// same class runs on the server (API guards) and in the browser (navigation, dashboards).
// The database enforces the same boundaries (sancus_is_global_admin, RLS on memberships).

import type { CompanyRow, MembershipRow, Role } from "./companies"

export type AccountType = "ADMIN" | "BRANCH" | "EMPLOYEE" | "INDIVIDUAL"

export type Permission =
  | "money.send" // payouts, ACH, transfers, swaps, Gateway deposits
  | "money.request" // ask for a company payout; it always waits for an approver
  | "money.receive" // collect into a wallet
  | "approvals.decide"
  | "policies.edit"
  | "branches.view"
  | "branches.create"
  | "members.manage" // add/disable people, set limits (scoped, see canManageMembersAt)
  | "accounts.create.branch"
  | "accounts.create.employee"
  | "spending.manage"
  | "activity.view"
  | "invoices.use"
  | "agents.business"
  | "card.view"
  | "limits.view"
  | "agent.use"
  | "settings"

export type NavKey =
  | "home"
  | "branch"
  | "me"
  | "pay"
  | "receive"
  | "activity"
  | "spending"
  | "branches"
  | "team"
  | "invoices"
  | "agents"
  | "devqa" // REMOVE BEFORE SUBMISSION — temporary rail test dashboard
  | "settings"

/** Client/server: Process and development tools. Turn off before submission. */
export function isDevQaEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SANCUS_DEV_QA === "true"
}

/** Inserts Process before Settings when the flag is on. */
export function navWithDevQa(nav: NavKey[]): NavKey[] {
  if (!isDevQaEnabled()) return [...nav]
  const out: NavKey[] = nav.filter((k) => k !== "devqa")
  const i = out.indexOf("settings")
  if (i >= 0) out.splice(i, 0, "devqa")
  else out.push("devqa")
  return out
}

/** A company node the account has a role on. */
export type AccountScope = {
  companyId: string
  companyName: string
  rootId: string
  country: string
  role: Role
  isRoot: boolean
}

export type AccountDto = {
  type: AccountType
  label: string
  userId: string
  email: string | null
  homePath: string
  nav: NavKey[]
  permissions: Permission[]
  scopes: AccountScope[]
  /** Company ids this account may manage people in (admin: whole tree; branch: its subtree). */
  manageableCompanyIds: string[]
  /** From the login's profile, when known (set by the API, not the class). */
  firstName?: string | null
}

const ALL: Permission[] = [
  "money.send",
  "money.receive",
  "approvals.decide",
  "policies.edit",
  "branches.view",
  "branches.create",
  "members.manage",
  "accounts.create.branch",
  "accounts.create.employee",
  "spending.manage",
  "activity.view",
  "invoices.use",
  "agents.business",
  "card.view",
  "limits.view",
  "agent.use",
  "settings",
]

/** Which nav section a path belongs to (null = always allowed, e.g. notifications). */
export function navKeyForPath(pathname: string): NavKey | null {
  const seg = pathname.split("/").filter(Boolean)[0] ?? ""
  const map: Record<string, NavKey> = {
    home: "home",
    branch: "branch",
    me: "me",
    pay: "pay",
    receive: "receive",
    activity: "activity",
    spending: "spending",
    branches: "branches",
    team: "team",
    invoices: "invoices",
    agents: "agents",
    "dev-qa": "devqa",
    dev: "devqa",
    process: "devqa",
    settings: "settings",
  }
  return map[seg] ?? null
}

export abstract class SancusAccount {
  abstract readonly type: AccountType
  abstract readonly label: string
  abstract readonly homePath: string
  /** Sections shown in the side navigation, in order. */
  abstract readonly nav: NavKey[]
  /** Sections reachable by URL (nav plus pages linked from inside the app). */
  protected abstract readonly paths: NavKey[]
  protected abstract readonly permissions: ReadonlySet<Permission>

  constructor(
    readonly userId: string,
    readonly email: string | null,
    readonly scopes: AccountScope[],
    protected readonly companies: Pick<CompanyRow, "id" | "parent_id" | "root_id" | "name" | "country">[]
  ) {}

  can(p: Permission): boolean {
    return this.permissions.has(p)
  }

  canAccessPath(pathname: string): boolean {
    const key = navKeyForPath(pathname)
    if (key === null) return true
    if (key === "devqa" && isDevQaEnabled()) return true
    return this.paths.includes(key)
  }

  /** Ids of `companyId` and everything under it. */
  protected subtree(companyId: string): string[] {
    const out = [companyId]
    for (let i = 0; i < out.length; i++) {
      for (const c of this.companies) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id)
    }
    return out
  }

  /** Where this account may add, disable and set limits for people. */
  abstract manageableCompanyIds(): string[]

  canManageMembersAt(companyId: string): boolean {
    return this.can("members.manage") && this.manageableCompanyIds().includes(companyId)
  }

  /** Branch accounts go on branches (never the global account); employees anywhere you manage. */
  canCreateAccount(type: "BRANCH" | "EMPLOYEE", companyId: string): boolean {
    const node = this.companies.find((c) => c.id === companyId)
    if (!node) return false
    if (type === "BRANCH") return this.can("accounts.create.branch") && node.parent_id !== null && this.canManageMembersAt(companyId)
    return this.can("accounts.create.employee") && this.canManageMembersAt(companyId)
  }

  toJSON(): AccountDto {
    return {
      type: this.type,
      label: this.label,
      userId: this.userId,
      email: this.email,
      homePath: this.homePath,
      nav: navWithDevQa(this.nav),
      permissions: [...this.permissions],
      scopes: this.scopes,
      manageableCompanyIds: this.manageableCompanyIds(),
    }
  }
}

export class AdminAccount extends SancusAccount {
  readonly type = "ADMIN" as const
  readonly label = "Admin"
  readonly homePath = "/home"
  readonly nav: NavKey[] = ["home", "pay", "activity", "spending", "branches", "team", "invoices", "agents", "settings"]
  protected readonly paths: NavKey[] = [...this.nav, "receive", "branch"]
  protected readonly permissions = new Set<Permission>(ALL)

  manageableCompanyIds(): string[] {
    const roots = new Set(this.scopes.filter((s) => s.isRoot).map((s) => s.rootId))
    return this.companies.filter((c) => roots.has(c.root_id)).map((c) => c.id)
  }
}

export class BranchAccount extends SancusAccount {
  readonly type = "BRANCH" as const
  readonly label = "Branch admin"
  readonly homePath = "/branch"
  readonly nav: NavKey[] = ["branch", "team", "spending", "branches", "receive", "agents", "settings"]
  protected readonly paths: NavKey[] = [...this.nav]
  protected readonly permissions = new Set<Permission>([
    "money.receive",
    "branches.view",
    "members.manage",
    "accounts.create.employee",
    "spending.manage",
    "activity.view",
    "agent.use",
    "settings",
  ])

  /** The branches this account runs (its own nodes), not the ones it inherits a role on. */
  get branches(): AccountScope[] {
    return this.scopes.filter((s) => !s.isRoot && (s.role === "OWNER" || s.role === "ADMIN"))
  }

  manageableCompanyIds(): string[] {
    return [...new Set(this.branches.flatMap((b) => this.subtree(b.companyId)))]
  }
}

export class EmployeeAccount extends SancusAccount {
  readonly type = "EMPLOYEE" as const
  readonly label = "Employee"
  readonly homePath = "/me"
  readonly nav: NavKey[] = ["me", "agents", "settings"]
  /** "pay" is reachable from Me → Request a payment. */
  protected readonly paths: NavKey[] = [...this.nav, "pay"]
  protected readonly permissions = new Set<Permission>(["money.request", "card.view", "limits.view", "agent.use", "settings"])

  manageableCompanyIds(): string[] {
    return []
  }
}

export class IndividualAccount extends SancusAccount {
  readonly type = "INDIVIDUAL" as const
  readonly label = "Personal"
  readonly homePath = "/home"
  readonly nav: NavKey[] = ["home", "pay", "activity", "agents", "settings"]
  /** "branches" stays reachable so a person can open a business (and become its admin). */
  protected readonly paths: NavKey[] = [...this.nav, "receive", "branches"]
  protected readonly permissions = new Set<Permission>([
    "money.send",
    "money.receive",
    "approvals.decide",
    "activity.view",
    "agent.use",
    "settings",
  ])

  manageableCompanyIds(): string[] {
    return []
  }
}

const ADMIN_ROLES: Role[] = ["OWNER", "ADMIN"]

/**
 * Picks the account for a user from their own ACTIVE memberships:
 * Owner/Admin on a global account → Admin; Owner/Admin on a branch → Branch admin;
 * any other role (Employee, Finance, Viewer) → Employee; no business → Individual.
 * When someone holds several, the most powerful wins.
 */
export function resolveAccount(input: {
  userId: string
  email: string | null
  companies: Pick<CompanyRow, "id" | "parent_id" | "root_id" | "name" | "country">[]
  memberships: Pick<MembershipRow, "company_id" | "user_id" | "role" | "status">[]
}): SancusAccount {
  const { userId, email, companies } = input
  const byId = new Map(companies.map((c) => [c.id, c]))
  const scopes: AccountScope[] = input.memberships
    .filter((m) => m.user_id === userId && m.status === "ACTIVE" && byId.has(m.company_id))
    .map((m) => {
      const c = byId.get(m.company_id)!
      return { companyId: c.id, companyName: c.name, rootId: c.root_id, country: c.country, role: m.role, isRoot: c.parent_id === null }
    })

  if (scopes.some((s) => s.isRoot && ADMIN_ROLES.includes(s.role))) return new AdminAccount(userId, email, scopes, companies)
  if (scopes.some((s) => !s.isRoot && ADMIN_ROLES.includes(s.role))) return new BranchAccount(userId, email, scopes, companies)
  if (scopes.length > 0) return new EmployeeAccount(userId, email, scopes, companies)
  return new IndividualAccount(userId, email, scopes, companies)
}

/** Rebuilds an account in the browser from the API's JSON (company list comes from the scopes). */
export function accountFromDto(dto: AccountDto, companies: Pick<CompanyRow, "id" | "parent_id" | "root_id" | "name" | "country">[] = []): SancusAccount {
  const args = [dto.userId, dto.email, dto.scopes, companies] as const
  switch (dto.type) {
    case "ADMIN":
      return new AdminAccount(...args)
    case "BRANCH":
      return new BranchAccount(...args)
    case "EMPLOYEE":
      return new EmployeeAccount(...args)
    default:
      return new IndividualAccount(...args)
  }
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ADMIN: "Business admin",
  BRANCH: "Branch admin",
  EMPLOYEE: "Employee",
  INDIVIDUAL: "Individual",
}
