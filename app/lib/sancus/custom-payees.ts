// Custom payees saved from Pay › Add payee (browser localStorage for now).
// Thailand (PromptPay mobile), Indonesia (bank account over BI-FAST) or Brazil (Pix key).
import type { Recipient } from "@/lib/sancus/demo-data"

export const CUSTOM_PAYEES_KEY = "sancus:custom-payees"

export type PayeeMethod = "PROMPTPAY" | "BI_FAST" | "PIX"

export type NewPayeeInput = {
  name: string
  kind: "Supplier" | "Contractor" | "Team" | "Friend" | "Family" | "Business"
  method: PayeeMethod
  /** PromptPay: Thai mobile. BI-FAST: account number. Pix: the Pix key (email, phone, CPF/CNPJ or random key). */
  value: string
  /** BI-FAST only: the bank's SWIFT code, e.g. CENAIDJA (BCA). */
  bankSwift?: string
}

/** Indonesian banks offered in the form (SWIFT codes Xendit routes BI-FAST by). */
export const ID_BANKS = [
  { swift: "CENAIDJA", name: "BCA" },
  { swift: "BMRIIDJA", name: "Mandiri" },
  { swift: "BNINIDJA", name: "BNI" },
  { swift: "BRINIDJA", name: "BRI" },
] as const

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

const last4 = (v: string) => `•••• ${v.slice(-4)}`

/** Thai mobile "081 234 5678" / "+66 81 234 5678" → "66812345678" (Xendit wants digits only). */
export function thaiMobile(value: string): string | null {
  const d = value.replace(/\D/g, "")
  const n = d.startsWith("66") ? d : d.startsWith("0") ? `66${d.slice(1)}` : d
  return /^66[689]\d{8}$/.test(n) ? n : null
}

export function buildCustomPayee(input: NewPayeeInput): { ok: true; recipient: Recipient } | { ok: false; error: string } {
  const name = input.name.trim()
  if (name.length < 2) return { ok: false, error: "Enter the payee's name" }
  const id = `custom-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`}`
  const base = { id, name, initials: initials(name), kind: input.kind, history: "Added just now" }

  if (input.method === "PROMPTPAY") {
    const mobile = thaiMobile(input.value)
    if (!mobile) return { ok: false, error: "Enter a Thai mobile number registered with PromptPay, e.g. 081 234 5678" }
    const detail = `mobile ${last4(mobile)}`
    return {
      ok: true,
      recipient: {
        ...base,
        detail: `${input.kind} · Thailand · PromptPay ${detail}`,
        rail: "PromptPay",
        country: "Thailand",
        methods: [{ rail: "PromptPay", detail, tag: "Default" }],
        xendit: { rail: "PROMPTPAY", accountNumber: mobile, routingType: "MOBILE_NO", routingValue: mobile, currency: "THB" },
      },
    }
  }

  if (input.method === "BI_FAST") {
    const account = input.value.replace(/\D/g, "")
    const bank = ID_BANKS.find((b) => b.swift === input.bankSwift)
    if (account.length < 8 || account.length > 20) return { ok: false, error: "Enter the bank account number (8 to 20 digits)" }
    if (!bank) return { ok: false, error: "Pick the bank" }
    const detail = `${bank.name} ${last4(account)}`
    return {
      ok: true,
      recipient: {
        ...base,
        detail: `${input.kind} · Indonesia · BI-FAST ${detail}`,
        rail: "BI-FAST",
        country: "Indonesia",
        methods: [{ rail: "BI-FAST", detail, tag: "Default" }],
        xendit: { rail: "BI_FAST", accountNumber: account, routingType: "SWIFT", routingValue: bank.swift, currency: "IDR" },
      },
    }
  }

  const key = input.value.trim()
  if (key.length < 3 || key.length > 140) return { ok: false, error: "Enter the Pix key (email, phone, CPF/CNPJ or random key)" }
  const detail = key.includes("@") ? `${key.slice(0, 3)}•••@${key.split("@")[1]}` : last4(key)
  return {
    ok: true,
    recipient: {
      ...base,
      detail: `${input.kind} · Brazil · Pix ${detail}`,
      rail: "Pix",
      country: "Brazil",
      methods: [{ rail: "Pix", detail, tag: "Default" }],
      pixKey: key,
    },
  }
}

export function loadCustomPayees(): Recipient[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(CUSTOM_PAYEES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Recipient[]
    // Older saved payees were Singapore PayNow; only keep ones we can still pay.
    return Array.isArray(parsed) ? parsed.filter((r) => r?.id && r?.name && (r.xendit || r.pixKey)) : []
  } catch {
    return []
  }
}

export function saveCustomPayees(list: Recipient[]) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CUSTOM_PAYEES_KEY, JSON.stringify(list))
}
