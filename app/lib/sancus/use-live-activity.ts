"use client"

import { useEffect, useState } from "react"
import { ledger as demoLedger, type Payment, type Status } from "@/lib/sancus/demo-data"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"
import type { CollectionDto, PixPaymentDto } from "@/lib/sancus/local-rails"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"
import type { EmployeeCardPurchaseDto } from "@/lib/sancus/employee-spending"
import type { InternalTransferDto } from "@/lib/sancus/internal-transfers"
import { SANCUS_DATA_CHANGED } from "@/lib/sancus/live-refresh"

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
  }).format(Number(minor) / (currency === "IDR" || currency === "JPY" ? 1 : 100))
}

function mapCardPurchase(p: EmployeeCardPurchaseDto): Payment {
  const amount = localMoney(p.currency, p.amountMinor)
  return {
    id: `card-purchase-${p.id}`,
    who: p.merchantName,
    amount: `−${amount}`,
    meta: `${new Date(p.authorizedAt).toLocaleString()} · employee card`,
    rail: "Card",
    status: p.status === "SETTLED" ? "Settled" : p.status === "HELD" ? "Pending" : "Failed",
    simulated: true,
    href: "/spending",
    ledger: {
      when: new Date(p.authorizedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: p.employeeName,
      theyGot: amount,
      fee: "—",
      rail: "Card",
    },
  }
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
    simulated: p.simulated,
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
    simulated: p.simulated,
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
    meta: `${new Date(p.createdAt).toLocaleString()} · ${p.providerTransactionId.startsWith("SIM-XE-") ? "Simulated payout" : "Xendit test mode"}`,
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
  const status: Status = p.status === "PAYMENT_PROCESSED"
    ? "Settled"
    : ["FAILED", "RETURNED", "REJECTED"].includes(p.status) ? "Failed" : "Pending"
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

type RailCollectionRow = {
  id: string
  rail: string
  currency: string
  amountMinor: string
  status: string
  destination: { label: string | null }
  createdAt: string
}

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
    status: ["CREDITED", "MINTED"].includes(c.status) ? "Settled" : ["FAILED", "EXPIRED"].includes(c.status) ? "Failed" : "Pending",
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

function mapInternalTransfer(p: InternalTransferDto): Payment {
  const amount = `$${displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)}`
  const settled = p.status === "COMPLETED"
  const failed = ["FAILED", "DECLINED", "EXPIRED", "REVERSED"].includes(p.status)
  return {
    id: `internal-transfer-${p.id}`,
    who: `${p.sourceName} → ${p.destinationName}`,
    amount: `−${amount}`,
    meta: `${new Date(p.createdAt).toLocaleString()} · ${p.sourceCurrency} → USDC → ${p.destinationCurrency}`,
    rail: "Internal",
    status: settled ? "Settled" : failed ? "Failed" : "Pending",
    simulated: p.simulated,
    href: `/branches/${p.destinationCompanyId}`,
    ledger: {
      when: new Date(p.createdAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      by: p.sourceName,
      theyGot: amount,
      fee: "$0.00",
      rail: "Arc",
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
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1)
    window.addEventListener(SANCUS_DATA_CHANGED, refresh)
    return () => window.removeEventListener(SANCUS_DATA_CHANGED, refresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    const json = async <T,>(url: string): Promise<T | null> => {
      try {
        const response = await fetch(url, { cache: "no-store" })
        return response.ok ? ((await response.json()) as T) : null
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
        const [collectionsBody, pixBody, xenditBody, cardBody, internalBody, achBody, railBody] = await Promise.all([
          json<{ collections?: CollectionDto[] }>("/api/sancus/collections"),
          json<{ payments?: PixPaymentDto[] }>("/api/sancus/pix/payments"),
          json<{ payouts?: XenditPayoutDto[] }>("/api/sancus/xendit/payouts"),
          json<{ purchases?: EmployeeCardPurchaseDto[] }>("/api/sancus/card-purchases"),
          json<{ transfers?: InternalTransferDto[] }>("/api/sancus/internal-transfers"),
          json<{ payments?: AchRow[] }>("/api/sancus/payments"),
          json<{ collections?: RailCollectionRow[] }>("/api/sancus/rails/collections"),
        ])
        const dated: { at: string; row: Payment }[] = [
          ...(internalBody?.transfers ?? []).map((item) => ({ at: item.createdAt, row: mapInternalTransfer(item) })),
          ...(cardBody?.purchases ?? []).map((item) => ({ at: item.authorizedAt, row: mapCardPurchase(item) })),
          ...(collectionsBody?.collections ?? []).map((item) => ({ at: item.createdAt, row: mapCollection(item) })),
          ...(pixBody?.payments ?? []).map((item) => ({ at: item.createdAt, row: mapPixPayment(item) })),
          ...(xenditBody?.payouts ?? []).map((item) => ({ at: item.createdAt, row: mapXenditPayout(item) })),
          ...(payoutBody.payouts ?? []).map((item) => ({ at: item.createdAt, row: mapPayout(item) })),
          ...(achBody?.payments ?? []).map((item) => ({ at: item.createdAt, row: mapAch(item) })),
          ...(railBody?.collections ?? []).map((item) => ({ at: item.createdAt, row: mapRailCollection(item) })),
        ]
        dated.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        if (!cancelled) {
          setLive(dated.map((item) => item.row))
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const pending = live?.some((payment) => payment.status === "Pending") ?? false
  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1)
    window.addEventListener("focus", refresh)
    const timer = pending ? window.setInterval(refresh, POLL_MS) : undefined
    return () => {
      window.removeEventListener("focus", refresh)
      if (timer) window.clearInterval(timer)
    }
  }, [pending])

  if (loading && live === null) {
    return { source: "live", payments: [], loading: true }
  }

  // Empty live activity stays empty — do not inject Café Paulista demo rows into
  // a real (or newly created) business account.
  if (!live) {
    return { source: "demo", payments: demoLedger, loading: false }
  }

  return { source: "live", payments: live, loading: false }
}
