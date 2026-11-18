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

export function useLiveActivity(): {
  source: "live" | "demo"
  payments: Payment[]
  loading: boolean
} {
  const [live, setLive] = useState<Payment[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
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
        const [collectionsRes, pixRes, xenditRes] = await Promise.all([
          fetch("/api/sancus/collections", { cache: "no-store" }),
          fetch("/api/sancus/pix/payments", { cache: "no-store" }),
          fetch("/api/sancus/xendit/payouts", { cache: "no-store" }),
        ])
        const collectionsBody = collectionsRes.ok ? ((await collectionsRes.json()) as { collections?: CollectionDto[] }) : {}
        const pixBody = pixRes.ok ? ((await pixRes.json()) as { payments?: PixPaymentDto[] }) : {}
        const xenditBody = xenditRes.ok ? ((await xenditRes.json()) as { payouts?: XenditPayoutDto[] }) : {}
        const rows = [
          ...(collectionsBody.collections ?? []).map(mapCollection),
          ...(pixBody.payments ?? []).map(mapPixPayment),
          ...(xenditBody.payouts ?? []).map(mapXenditPayout),
          ...(payoutBody.payouts ?? []).map(mapPayout),
        ]
        if (!cancelled) {
          setLive(rows)
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!live || live.length === 0) {
    return { source: "demo", payments: demoLedger, loading }
  }

  return { source: "live", payments: live, loading: false }
}
