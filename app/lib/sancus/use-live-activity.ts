"use client"

import { useEffect, useState } from "react"
import { ledger as demoLedger, type Payment, type Status } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"
import type { CollectionDto, PixPaymentDto } from "@/lib/sancus/local-rails"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"

function statusFromPayout(status: string): Status {
  switch (status) {
    case "COMPLETED":
      return "Settled"
    case "FAILED":
    case "CANCELLED":
    case "REJECTED": // declined by an approver
      return "Failed"
    default:
      return "Pending"
  }
}

function mapPayout(p: PayoutDto): Payment {
  const usdc = displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)
  const sgd = displayMinor(BigInt(p.sgdAmountMinor), 2, "", 2)
  return {
    id: p.id,
    who: p.recipientName,
    amount: `−$${usdc}`,
    meta: `S$ ${sgd} · ${new Date(p.createdAt).toLocaleString()}`,
    rail: p.rail === "PAYNOW" ? "PayNow" : p.rail,
    status: statusFromPayout(p.status),
    simulated: p.simulated,
    href: "/activity",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: "You",
      theyGot: `S$ ${sgd}`,
      fee: `S$ ${displayMinor(BigInt(p.feeSgdMinor), 2, "", 2)}`,
    },
  }
}

function localStatus(value: string): Status {
  return value === "SETTLED" ? "Settled" : value === "PENDING" || value === "COMPLIANCE_REVIEW" ? "Pending" : "Failed"
}

function localMoney(currency: string, minor: string) {
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : currency === "BRL" ? "pt-BR" : currency === "PHP" ? "en-PH" : "th-TH", {
    style: "currency", currency, maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(minor) / (currency === "IDR" ? 1 : 100))
}

function mapCollection(p: CollectionDto): Payment {
  const amount = localMoney(p.currency, p.amountLocalMinor)
  return {
    id: `collection-${p.id}`,
    who: p.customerName || `${p.rail} customer`,
    amount: `+${amount}`,
    amountIn: true,
    meta: `${new Date(p.createdAt).toLocaleString()} · sandbox collection`,
    rail: p.rail === "PROMPTPAY" ? "PromptPay" : p.rail,
    status: localStatus(p.status),
    simulated: true,
    href: "/receive",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: "Customer",
      theyGot: amount,
      fee: "—",
      rail: p.rail === "PROMPTPAY" ? "PromptPay" : p.rail,
    },
  }
}

function mapPixPayment(p: PixPaymentDto): Payment {
  const amount = localMoney("BRL", p.amountBrlMinor)
  return {
    id: `pix-payment-${p.id}`,
    who: `${p.recipientName}${p.employeeName ? ` · ${p.employeeName}` : ""}`,
    amount: `−${amount}`,
    meta: `${new Date(p.createdAt).toLocaleString()} · PayZu sandbox`,
    rail: "Pix",
    status: localStatus(p.status),
    simulated: true,
    href: p.purpose === "EMPLOYEE_SPEND" ? "/spending" : "/pay",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: p.employeeName || "You",
      theyGot: amount,
      fee: "—",
      rail: "Pix",
    },
  }
}

function mapXenditPayout(p: XenditPayoutDto): Payment {
  const amount = localMoney(p.currency, p.amountMinor)
  return {
    id: `xendit-payout-${p.id}`,
    who: `${p.recipientName}${p.employeeName ? ` · ${p.employeeName}` : ""}`,
    amount: `−${amount}`,
    meta: `${new Date(p.createdAt).toLocaleString()} · Xendit test mode`,
    rail: p.rail.replace("_", "-"),
    status: localStatus(p.status),
    simulated: true,
    href: p.purpose === "EMPLOYEE_SPEND" ? "/spending" : "/pay",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: p.employeeName || "You",
      theyGot: amount,
      fee: "Xendit sandbox",
      rail: p.rail.replace("_", "-"),
    },
  }
}

// US ACH payouts (/api/sancus/payments).
type AchRow = {
  id: string
  recipient: { name: string; bankName: string; accountMasked: string }
  usdAmountMinor: string
  feeUsdMinor: string
  usdcAmountMinor: string
  status: string
  speed: string
  settlement: { fundedOnchain: boolean }
  createdAt: string
}
function mapAch(p: AchRow): Payment {
  const usd = displayMinor(BigInt(p.usdAmountMinor), 2, "", 2)
  const status: Status =
    p.status === "PAYMENT_PROCESSED" ? "Settled" : ["FAILED", "RETURNED", "REJECTED"].includes(p.status) ? "Failed" : "Pending"
  return {
    id: `ach-${p.id}`,
    who: p.recipient.name,
    amount: `−$${displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)}`,
    meta: `US$ ${usd} to ${p.recipient.bankName} ${p.recipient.accountMasked} · ${new Date(p.createdAt).toLocaleString()}${p.status === "RETURNED" ? " · returned" : ""}`,
    rail: p.speed === "SAME_DAY" ? "Same-day ACH" : "ACH",
    status,
    simulated: !p.settlement.fundedOnchain,
    href: "/pay/us-bank",
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: "You",
      theyGot: `US$ ${usd}`,
      fee: `US$ ${displayMinor(BigInt(p.feeUsdMinor), 2, "", 2)}`,
      rail: "ACH",
    },
  }
}

// Local-rail collections that mint mock stablecoins (/api/sancus/rails/collections).
type RailCollectionRow = { id: string; rail: string; currency: string; amountMinor: string; status: string; destination: { label: string | null }; createdAt: string }
function mapRailCollection(c: RailCollectionRow): Payment {
  const amount = `${(Number(c.amountMinor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.currency}`
  const rail = c.rail === "PROMPTPAY" ? "PromptPay" : c.rail === "PIX" ? "Pix" : c.rail
  return {
    id: `rail-collection-${c.id}`,
    who: `${rail} customer`,
    amount: `+${amount}`,
    amountIn: true,
    meta: `${new Date(c.createdAt).toLocaleString()} · into ${c.destination.label ?? "your wallet"}`,
    rail,
    status: c.status === "MINTED" ? "Settled" : ["FAILED", "EXPIRED"].includes(c.status) ? "Failed" : "Pending",
    simulated: true,
    href: "/receive",
    ledger: {
      when: new Date(c.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: "Customer",
      theyGot: amount,
      fee: "—",
      rail,
    },
  }
}

const POLL_MS = 5000

export function useLiveActivity(): {
  source: "live" | "demo"
  payments: Payment[]
  loading: boolean
} {
  const [live, setLive] = useState<Payment[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const json = async <T,>(url: string): Promise<T | null> => {
      try {
        const r = await fetch(url, { cache: "no-store" })
        return r.ok ? ((await r.json()) as T) : null
      } catch {
        return null
      }
    }
    ;(async () => {
      try {
        let res = await fetch("/api/sancus/payouts", { cache: "no-store" })
        // Right after demo auto-login the session cookie can lag the first request; retry once.
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 1200))
          if (cancelled) return
          res = await fetch("/api/sancus/payouts", { cache: "no-store" })
        }
        const payoutBody = res.ok ? ((await res.json()) as { payouts?: PayoutDto[] }) : {}
        const [collectionsBody, pixBody, xenditBody, achBody, railBody] = await Promise.all([
          json<{ collections?: CollectionDto[] }>("/api/sancus/collections"),
          json<{ payments?: PixPaymentDto[] }>("/api/sancus/pix/payments"),
          json<{ payouts?: XenditPayoutDto[] }>("/api/sancus/xendit/payouts"),
          json<{ payments?: AchRow[] }>("/api/sancus/payments"),
          json<{ collections?: RailCollectionRow[] }>("/api/sancus/rails/collections"),
        ])
        // Newest first across every rail.
        const dated: { at: string; row: Payment }[] = [
          ...(collectionsBody?.collections ?? []).map((c) => ({ at: c.createdAt, row: mapCollection(c) })),
          ...(pixBody?.payments ?? []).map((p) => ({ at: p.createdAt, row: mapPixPayment(p) })),
          ...(xenditBody?.payouts ?? []).map((p) => ({ at: p.createdAt, row: mapXenditPayout(p) })),
          ...(payoutBody.payouts ?? []).map((p) => ({ at: p.createdAt, row: mapPayout(p) })),
          ...(achBody?.payments ?? []).map((p) => ({ at: p.createdAt, row: mapAch(p) })),
          ...(railBody?.collections ?? []).map((c) => ({ at: c.createdAt, row: mapRailCollection(c) })),
        ]
        dated.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        if (!cancelled) {
          setLive(dated.map((d) => d.row))
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tick])

  // Keep it current: re-check while anything is in progress, and whenever the tab regains focus.
  const pending = live?.some((p) => p.status === "Pending") ?? false
  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1)
    window.addEventListener("focus", onFocus)
    const timer = pending ? window.setInterval(onFocus, POLL_MS) : undefined
    return () => {
      window.removeEventListener("focus", onFocus)
      if (timer) window.clearInterval(timer)
    }
  }, [pending])

  if (!live || live.length === 0) {
    return { source: "demo", payments: demoLedger, loading }
  }

  return { source: "live", payments: live, loading: false }
}
