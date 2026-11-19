"use client"

import { useEffect, useState } from "react"
import { displayMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import type { PayoutDto } from "@/lib/sancus/payouts"
import type { CollectionDto, PixPaymentDto } from "@/lib/sancus/local-rails"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"
import type { EmployeeCardPurchaseDto } from "@/lib/sancus/employee-spending"
import type { InternalTransferDto } from "@/lib/sancus/internal-transfers"
import type { AchPaymentDto } from "@/lib/sancus/ach"
import { SANCUS_DATA_CHANGED } from "@/lib/sancus/live-refresh"
import {
  arcExplorer,
  buildPipeline,
  demoProcessSeeds,
  type DestinationKind,
  type ProcessStep,
} from "@/lib/sancus/process-pipeline"

export type ProcessLogEntry = {
  id: string
  at: string
  whenLabel: string
  who: string
  amount: string
  amountIn?: boolean
  rail: string
  status: "Settled" | "Pending" | "Held" | "Failed"
  corridorLabel: string
  destinationKind: DestinationKind
  steps: ProcessStep[]
  explorerUrl: string | null
  simulated?: boolean
  source: "live" | "demo"
}

type RailCollectionRow = {
  id: string
  rail: string
  currency: string
  amountMinor: string
  status: string
  mintTx?: string | null
  mintExplorer?: string | null
  destination: { label: string | null }
  createdAt: string
}

function localMoney(currency: string, minor: string) {
  return new Intl.NumberFormat(currency === "IDR" ? "id-ID" : currency === "BRL" ? "pt-BR" : currency === "PHP" ? "en-PH" : "th-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "IDR" ? 0 : 2,
  }).format(Number(minor) / (currency === "IDR" || currency === "JPY" ? 1 : 100))
}

function statusFrom(value: string, kind: "payout" | "local" | "ach" | "rail" | "internal" | "card"): ProcessLogEntry["status"] {
  if (kind === "payout") {
    if (value === "COMPLETED") return "Settled"
    if (["FAILED", "CANCELLED", "REJECTED"].includes(value)) return "Failed"
    return "Pending"
  }
  if (kind === "ach") {
    if (value === "PAYMENT_PROCESSED") return "Settled"
    if (["FAILED", "RETURNED", "REJECTED"].includes(value)) return "Failed"
    return "Pending"
  }
  if (kind === "rail") {
    if (value === "MINTED") return "Settled"
    if (["FAILED", "EXPIRED"].includes(value)) return "Failed"
    return "Pending"
  }
  if (kind === "internal") {
    if (value === "COMPLETED") return "Settled"
    if (["FAILED", "DECLINED", "EXPIRED", "REVERSED"].includes(value)) return "Failed"
    return "Pending"
  }
  if (kind === "card") {
    if (value === "SETTLED") return "Settled"
    if (value === "HELD") return "Held"
    if (value === "FAILED") return "Failed"
    return "Pending"
  }
  if (value === "SETTLED") return "Settled"
  if (value === "PENDING" || value === "COMPLIANCE_REVIEW") return "Pending"
  return "Failed"
}

function wrap(input: {
  id: string
  at: string
  who: string
  amount: string
  amountIn?: boolean
  rail: string
  status: ProcessLogEntry["status"]
  amountUsd?: number | null
  localAmountLabel?: string
  usdcLabel?: string
  inbound?: boolean
  destinationKind?: DestinationKind
  txHash?: string | null
  explorerUrl?: string | null
  mintTxHash?: string | null
  simulated?: boolean
  source: "live" | "demo"
}): ProcessLogEntry {
  const { corridor, steps } = buildPipeline({
    rail: input.rail,
    status: input.status,
    inbound: input.inbound,
    amountUsd: input.amountUsd,
    destinationKind: input.destinationKind,
    localAmountLabel: input.localAmountLabel,
    usdcLabel: input.usdcLabel,
    txHash: input.txHash,
    explorerUrl: input.explorerUrl,
    mintTxHash: input.mintTxHash,
    simulated: input.simulated,
  })
  const explorerUrl = input.explorerUrl || arcExplorer(input.txHash) || arcExplorer(input.mintTxHash)
  return {
    id: input.id,
    at: input.at,
    whenLabel: new Date(input.at).toLocaleString(),
    who: input.who,
    amount: input.amount,
    amountIn: input.amountIn,
    rail: input.rail,
    status: input.status,
    corridorLabel: corridor.label,
    destinationKind: corridor.destinationKind,
    steps,
    explorerUrl,
    simulated: input.simulated,
    source: input.source,
  }
}

const POLL_MS = 5000

export function useProcessLog(): { entries: ProcessLogEntry[]; loading: boolean; source: "live" | "demo" } {
  const [entries, setEntries] = useState<ProcessLogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const refresh = () => setRefreshKey((v) => v + 1)
    window.addEventListener(SANCUS_DATA_CHANGED, refresh)
    return () => window.removeEventListener(SANCUS_DATA_CHANGED, refresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    const json = async <T,>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { cache: "no-store" })
        return res.ok ? ((await res.json()) as T) : null
      } catch {
        return null
      }
    }

    ;(async () => {
      try {
        let res = await fetch("/api/sancus/payouts", { cache: "no-store" })
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
          json<{ payments?: AchPaymentDto[] }>("/api/sancus/payments"),
          json<{ collections?: RailCollectionRow[] }>("/api/sancus/rails/collections"),
        ])

        const rows: ProcessLogEntry[] = []

        for (const p of payoutBody.payouts ?? []) {
          const usdc = displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)
          const sgd = displayMinor(BigInt(p.sgdAmountMinor), 2, "", 2)
          rows.push(
            wrap({
              id: p.id,
              at: p.createdAt,
              who: p.recipientName,
              amount: `−$${usdc}`,
              rail: p.rail === "PAYNOW" ? "PayNow" : p.rail,
              status: statusFrom(p.status, "payout"),
              amountUsd: Number(usdc),
              localAmountLabel: `S$ ${sgd}`,
              usdcLabel: `${usdc} USDC`,
              txHash: p.txHash,
              simulated: p.simulated,
              source: "live",
            })
          )
        }

        for (const p of achBody?.payments ?? []) {
          const usd = displayMinor(BigInt(p.usdAmountMinor), 2, "", 2)
          const usdc = displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)
          rows.push(
            wrap({
              id: `ach-${p.id}`,
              at: p.createdAt,
              who: p.recipient.name,
              amount: `−$${usdc}`,
              rail: p.speed === "SAME_DAY" ? "Same-day ACH" : "ACH",
              status: statusFrom(p.status, "ach"),
              amountUsd: Number(usd),
              localAmountLabel: `US$ ${usd}`,
              usdcLabel: `${usdc} USDC`,
              txHash: p.settlement.txHash,
              explorerUrl: p.settlement.explorer,
              simulated: !p.settlement.fundedOnchain,
              destinationKind: "bank",
              source: "live",
            })
          )
        }

        for (const p of pixBody?.payments ?? []) {
          const amount = localMoney("BRL", p.amountBrlMinor)
          rows.push(
            wrap({
              id: `pix-${p.id}`,
              at: p.createdAt,
              who: p.recipientName,
              amount: `−${amount}`,
              rail: "Pix",
              status: statusFrom(p.status, "local"),
              localAmountLabel: amount,
              simulated: p.simulated,
              destinationKind: "bank",
              source: "live",
            })
          )
        }

        for (const p of xenditBody?.payouts ?? []) {
          const amount = localMoney(p.currency, p.amountMinor)
          const rail = p.rail.replace("_", "-")
          rows.push(
            wrap({
              id: `xendit-${p.id}`,
              at: p.createdAt,
              who: p.recipientName,
              amount: `−${amount}`,
              rail,
              status: statusFrom(p.status, "local"),
              localAmountLabel: amount,
              destinationKind: "bank",
              simulated: true,
              source: "live",
            })
          )
        }

        for (const p of cardBody?.purchases ?? []) {
          const amount = localMoney(p.currency, p.amountMinor)
          rows.push(
            wrap({
              id: `card-${p.id}`,
              at: p.authorizedAt,
              who: p.merchantName,
              amount: `−${amount}`,
              rail: "Card",
              status: statusFrom(p.status, "card"),
              localAmountLabel: amount,
              destinationKind: "card",
              simulated: true,
              source: "live",
            })
          )
        }

        for (const p of collectionsBody?.collections ?? []) {
          const amount = localMoney(p.currency, p.amountLocalMinor)
          rows.push(
            wrap({
              id: `collection-${p.id}`,
              at: p.createdAt,
              who: p.customerName || `${p.rail} customer`,
              amount: `+${amount}`,
              amountIn: true,
              rail: p.rail === "PROMPTPAY" ? "PromptPay" : p.rail,
              status: statusFrom(p.status, "local"),
              inbound: true,
              localAmountLabel: amount,
              destinationKind: "collection",
              simulated: p.simulated,
              source: "live",
            })
          )
        }

        for (const c of railBody?.collections ?? []) {
          const amount = `${(Number(c.amountMinor) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c.currency}`
          const rail = c.rail === "PROMPTPAY" ? "PromptPay" : c.rail === "PIX" ? "Pix" : c.rail
          rows.push(
            wrap({
              id: `rail-${c.id}`,
              at: c.createdAt,
              who: `${rail} customer`,
              amount: `+${amount}`,
              amountIn: true,
              rail,
              status: statusFrom(c.status, "rail"),
              inbound: true,
              localAmountLabel: amount,
              mintTxHash: c.mintTx,
              explorerUrl: c.mintExplorer ?? arcExplorer(c.mintTx),
              destinationKind: "collection",
              simulated: true,
              source: "live",
            })
          )
        }

        for (const p of internalBody?.transfers ?? []) {
          const amount = `$${displayMinor(BigInt(p.usdcAmountMinor), USDC_DECIMALS, "", 2)}`
          rows.push(
            wrap({
              id: `internal-${p.id}`,
              at: p.createdAt,
              who: `${p.sourceName} → ${p.destinationName}`,
              amount: `−${amount}`,
              rail: "Internal",
              status: statusFrom(p.status, "internal"),
              usdcLabel: amount,
              txHash: p.usdcTxHash ?? p.burnTxHash,
              mintTxHash: p.mintTxHash,
              destinationKind: "internal",
              simulated: p.simulated,
              source: "live",
            })
          )
        }

        rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

        if (!cancelled) {
          if (rows.length === 0) {
            setEntries(
              demoProcessSeeds().map((s) =>
                wrap({
                  ...s,
                  simulated: true,
                  source: "demo",
                  explorerUrl: s.txHash ? arcExplorer(s.txHash) : null,
                })
              )
            )
          } else {
            setEntries(rows)
          }
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setEntries(
            demoProcessSeeds().map((s) =>
              wrap({
                ...s,
                simulated: true,
                source: "demo",
                explorerUrl: s.txHash ? arcExplorer(s.txHash) : null,
              })
            )
          )
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const pending = entries?.some((e) => e.status === "Pending") ?? false
  useEffect(() => {
    const refresh = () => setRefreshKey((v) => v + 1)
    window.addEventListener("focus", refresh)
    const timer = pending ? window.setInterval(refresh, POLL_MS) : undefined
    return () => {
      window.removeEventListener("focus", refresh)
      if (timer) window.clearInterval(timer)
    }
  }, [pending])

  if (loading && entries === null) {
    return { entries: [], loading: true, source: "demo" }
  }

  const list = entries ?? []
  return {
    entries: list,
    loading: false,
    source: list.some((e) => e.source === "live") ? "live" : "demo",
  }
}
