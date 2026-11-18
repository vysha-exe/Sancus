// Sancus: notification helpers — catalog categories from docs/notifications.md.

export type NtfCategory =
  | "approvals"
  | "money_in"
  | "payments"
  | "spending"
  | "bills"
  | "agents"
  | "team"
  | "rules"
  | "security"
  | "account"

export type NtfPriority = "action" | "alert" | "info"

export type NotificationDto = {
  id: string
  type: string
  category: NtfCategory
  priority: NtfPriority
  title: string
  body: string
  link: string | null
  readAt: string | null
  resolvedAt: string | null
  createdAt: string
  companyId: string | null
}

export const CATEGORY_LABEL: Record<NtfCategory, string> = {
  approvals: "Approval",
  money_in: "Money in",
  payments: "Payment",
  spending: "Card",
  bills: "Bill",
  agents: "Agent",
  team: "Team",
  rules: "Rules",
  security: "Security",
  account: "Account",
}

/** Infer category from dotted type or legacy stub types. */
export function categoryFromType(type: string): NtfCategory {
  if (type.startsWith("approval") || type === "approval.requested") return "approvals"
  if (type.startsWith("money_in")) return "money_in"
  if (type.startsWith("payment")) return "payments"
  if (type.startsWith("card") || type.startsWith("qr") || type.startsWith("spend") || type.startsWith("holds"))
    return "spending"
  if (type.startsWith("invoice") || type.startsWith("bill")) return "bills"
  if (type.startsWith("agent")) return "agents"
  if (type.startsWith("invite") || type.startsWith("role") || type.startsWith("team") || type === "invite_sent" || type === "invite_accepted" || type === "role_changed")
    return "team"
  if (type.startsWith("rule") || type.startsWith("policy")) return "rules"
  if (type.startsWith("security") || type.startsWith("session")) return "security"
  return "account"
}

export function priorityFromType(type: string, payload?: Record<string, unknown>): NtfPriority {
  if (payload?.priority === "action" || payload?.priority === "alert" || payload?.priority === "info") {
    return payload.priority as NtfPriority
  }
  if (/requested|needs_review|needs_approval|receipt_missing|due_soon/.test(type)) return "action"
  if (/failed|declined|expired|returned|frozen|overdue|security/.test(type)) return "alert"
  return "info"
}

export function titleFromRow(type: string, payload: Record<string, unknown>): string {
  if (typeof payload.title === "string" && payload.title) return payload.title
  switch (type) {
    case "invite_sent":
      return `Invite ready for ${payload.email ?? "teammate"}`
    case "invite_accepted":
      return `${payload.email ?? "Someone"} joined`
    case "role_changed":
      return `Role updated for ${payload.email ?? "teammate"}`
    default:
      return type.replace(/[._]/g, " ")
  }
}

export function bodyFromRow(type: string, payload: Record<string, unknown>): string {
  if (typeof payload.body === "string" && payload.body) return payload.body
  if (typeof payload.companyName === "string") return String(payload.companyName)
  if (typeof payload.role === "string") return `Role: ${payload.role}`
  return ""
}

export function linkFromRow(type: string, payload: Record<string, unknown>): string | null {
  if (typeof payload.link === "string") return payload.link
  if (type.startsWith("invite") || type === "invite_sent" || type === "invite_accepted" || type === "role_changed")
    return "/team"
  if (type.startsWith("approval")) return "/activity"
  if (type.startsWith("invoice") || type.startsWith("bill")) return "/invoices"
  if (type.startsWith("card") || type.startsWith("spend")) return "/spending"
  return null
}

export const PREFS_KEY = "sancus_notification_prefs"

export type ChannelPrefs = { inApp: boolean; email: boolean; push: boolean }

export type NotificationPrefs = Record<NtfCategory, ChannelPrefs>

export const DEFAULT_PREFS: NotificationPrefs = {
  approvals: { inApp: true, email: true, push: true },
  money_in: { inApp: true, email: false, push: true },
  payments: { inApp: true, email: false, push: true },
  spending: { inApp: true, email: false, push: true },
  bills: { inApp: true, email: false, push: false },
  agents: { inApp: true, email: true, push: true },
  team: { inApp: true, email: true, push: false },
  rules: { inApp: true, email: true, push: false },
  security: { inApp: true, email: true, push: true },
  account: { inApp: true, email: true, push: false },
}

export function readPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return DEFAULT_PREFS
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_PREFS
  }
}

export function writePrefs(prefs: NotificationPrefs) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}
