// Custom payees saved from Pay › Add payee (browser localStorage for now).
import type { Recipient } from "@/lib/sancus/demo-data"
import { normaliseRecipient, type ProxyType } from "@/lib/sancus/paynow"

export const CUSTOM_PAYEES_KEY = "sancus:custom-payees"

export type NewPayeeInput = {
  name: string
  kind: "Supplier" | "Contractor" | "Team"
  proxyType: ProxyType
  proxyValue: string
  bankCode?: string
  country?: string
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

function mask(proxyType: ProxyType, value: string) {
  if (proxyType === "UEN") return value
  if (value.length <= 4) return value
  return `${"•".repeat(Math.min(4, value.length - 4))}${value.slice(-4)}`
}

export function buildCustomPayee(input: NewPayeeInput): Recipient {
  const n = normaliseRecipient({
    name: input.name,
    proxyType: input.proxyType,
    proxyValue: input.proxyValue,
    bankCode: input.bankCode,
  })
  const rail = n.proxyType === "BANK" ? "FAST" : "PayNow"
  const detailLabel =
    n.proxyType === "MOBILE" ? `mobile ${mask(n.proxyType, n.proxyValue)}` : n.proxyType === "UEN" ? `UEN ${n.proxyValue}` : `account ${mask(n.proxyType, n.proxyValue)}`
  return {
    id: `custom-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`}`,
    name: n.name,
    initials: initials(n.name),
    kind: input.kind,
    detail: `${input.kind} · Singapore · ${rail} ${detailLabel}`,
    rail,
    country: input.country?.trim() || "Singapore",
    methods: [{ rail, detail: detailLabel, tag: "Default" }],
    history: "Added just now",
    payout: {
      proxyType: n.proxyType,
      proxyValue: n.proxyValue,
      bankCode: n.bankCode,
      currency: "SGD",
    },
  }
}

export function loadCustomPayees(): Recipient[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_PAYEES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Recipient[]
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r?.name && r?.payout) : []
  } catch {
    return []
  }
}

export function saveCustomPayees(list: Recipient[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CUSTOM_PAYEES_KEY, JSON.stringify(list))
}
