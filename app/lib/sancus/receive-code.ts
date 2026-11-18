import type { LocalRail } from "./local-sandboxes"

export const RECEIVE_RAILS: Record<LocalRail, { label: string; currency: "IDR" | "THB" | "BRL"; country: string }> = {
  QRIS: { label: "QRIS", currency: "IDR", country: "ID" },
  PROMPTPAY: { label: "PromptPay", currency: "THB", country: "TH" },
  PIX: { label: "Pix", currency: "BRL", country: "BR" },
}

export type ReceiveCode = { rail: LocalRail; companyId: string }

/** Stable, amount-free receive identity. The payer chooses the amount after scanning. */
export function encodeReceiveCode(input: ReceiveCode) {
  const query = new URLSearchParams({ rail: input.rail, company: input.companyId })
  return `sancus://receive/v1?${query.toString()}`
}

export function parseReceiveCode(value: string): ReceiveCode | null {
  try {
    const url = new URL(value.trim())
    const rail = url.searchParams.get("rail")
    const companyId = url.searchParams.get("company")
    if (url.protocol !== "sancus:" || url.hostname !== "receive" || url.pathname !== "/v1") return null
    if (rail !== "QRIS" && rail !== "PROMPTPAY" && rail !== "PIX") return null
    if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) return null
    return { rail, companyId }
  } catch {
    return null
  }
}
