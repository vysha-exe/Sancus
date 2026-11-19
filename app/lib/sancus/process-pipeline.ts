// Explains Sancus settlement for the Process log. Bank payouts may use the
// treasury settlement path; cards always use the issuing branch's local balance.

export const ARC_TX_EXPLORER = "https://explorer.testnet.arc.io/tx"

export type ProcessStepStatus = "done" | "active" | "pending" | "skipped"
export type DestinationKind = "bank" | "card" | "collection" | "internal"

export type ProcessStep = {
  id: string
  title: string
  detail: string
  status: ProcessStepStatus
  explorerUrl?: string | null
}

export type ProcessCorridor = {
  label: string
  localCurrency: string
  localRail: string
  destinationKind: DestinationKind
}

export function arcExplorer(txHash: string | null | undefined): string | null {
  if (!txHash?.trim()) return null
  return `${ARC_TX_EXPLORER}/${txHash.trim()}`
}

/** Map a payment rail onto the product corridor (destination follows the live rail). */
export function corridorFor(rail: string, opts?: { inbound?: boolean; destinationKind?: DestinationKind; currency?: string }): ProcessCorridor {
  const r = rail.toUpperCase().replace(/\s+/g, " ")
  const kind = opts?.destinationKind

  if (opts?.inbound || kind === "collection" || r.includes("COLLECTION")) {
    if (r.includes("PIX")) return { label: "BRL → Pix → mint → treasury", localCurrency: "BRL", localRail: "Pix", destinationKind: "collection" }
    if (r.includes("PROMPTPAY")) return { label: "THB → PromptPay → mint → treasury", localCurrency: "THB", localRail: "PromptPay", destinationKind: "collection" }
    if (r.includes("QRIS")) return { label: "IDR → QRIS → mint → treasury", localCurrency: "IDR", localRail: "QRIS", destinationKind: "collection" }
    return { label: "Local rail → mint → treasury", localCurrency: "LOCAL", localRail: rail, destinationKind: "collection" }
  }

  if (kind === "card" || r === "CARD" || r.includes("CARD")) {
    const currency = opts?.currency?.toUpperCase() || "LOCAL"
    return { label: `${currency} branch balance → card network`, localCurrency: currency, localRail: "Card network", destinationKind: "card" }
  }
  if (kind === "internal" || r === "INTERNAL" || r.includes("INTERNAL")) {
    return { label: "Branch token → fUSDC → branch token", localCurrency: "USDC", localRail: "Arc internal", destinationKind: "internal" }
  }
  if (r.includes("ACH")) {
    return {
      label: "USD → fUSDC → US ACH (bank)",
      localCurrency: "USD",
      localRail: r.includes("SAME") ? "Same-day ACH" : "ACH",
      destinationKind: "bank",
    }
  }
  if (r.includes("PAYNOW")) {
    return { label: "USD → fUSDC → SGD → PayNow", localCurrency: "SGD", localRail: "PayNow", destinationKind: "bank" }
  }
  if (r === "FAST") {
    return { label: "USD → fUSDC → SGD → FAST (bank)", localCurrency: "SGD", localRail: "FAST", destinationKind: "bank" }
  }
  if (r.includes("PIX")) {
    return { label: "USD → fUSDC → BRL → Pix", localCurrency: "BRL", localRail: "Pix", destinationKind: "bank" }
  }
  if (r.includes("PROMPTPAY")) {
    return { label: "USD → fUSDC → THB → PromptPay", localCurrency: "THB", localRail: "PromptPay", destinationKind: "bank" }
  }
  if (r.includes("QRIS") || r.includes("BI-FAST") || r.includes("BI_FAST")) {
    return { label: "USD → fUSDC → IDR → QRIS / BI-FAST", localCurrency: "IDR", localRail: "QRIS", destinationKind: "bank" }
  }
  if (r.includes("SEPA")) {
    return { label: "USD → fUSDC → EUR → SEPA", localCurrency: "EUR", localRail: "SEPA", destinationKind: "bank" }
  }
  if (r.includes("SPEI")) {
    return { label: "USD → fUSDC → MXN → SPEI", localCurrency: "MXN", localRail: "SPEI", destinationKind: "bank" }
  }
  if (r.includes("WIRE")) {
    return { label: "USD → fUSDC → USD wire", localCurrency: "USD", localRail: "Wire", destinationKind: "bank" }
  }
  return {
    label: `USD → fUSDC → ${rail}`,
    localCurrency: "LOCAL",
    localRail: rail,
    destinationKind: kind ?? "bank",
  }
}

function stepStatus(overall: "Settled" | "Pending" | "Held" | "Failed", index: number, total: number, failedAt?: number): ProcessStepStatus {
  if (overall === "Failed" && failedAt != null) {
    if (index < failedAt) return "done"
    if (index === failedAt) return "active"
    return "pending"
  }
  if (overall === "Settled") return "done"
  if (overall === "Held") return index === 0 ? "done" : index === 1 ? "active" : "pending"
  // Pending: fill through mid pipeline
  const active = Math.min(total - 1, Math.max(1, Math.floor(total / 2)))
  if (index < active) return "done"
  if (index === active) return "active"
  return "pending"
}

export type BuildPipelineInput = {
  rail: string
  status: "Settled" | "Pending" | "Held" | "Failed"
  inbound?: boolean
  amountUsd?: number | null
  /** Force destination (e.g. live Card purchases). */
  destinationKind?: DestinationKind
  /** Currency of the issuing branch / instrument. */
  currency?: string
  localAmountLabel?: string
  usdcLabel?: string
  txHash?: string | null
  explorerUrl?: string | null
  mintTxHash?: string | null
  simulated?: boolean
}

/** Ordered legs for one transaction, with optional Arc explorer links. */
export function buildPipeline(input: BuildPipelineInput): { corridor: ProcessCorridor; steps: ProcessStep[] } {
  const explorer = input.explorerUrl || arcExplorer(input.txHash)
  const corridor = corridorFor(input.rail, { inbound: input.inbound, destinationKind: input.destinationKind, currency: input.currency })

  const local = input.localAmountLabel ?? corridor.localCurrency
  const usdc = input.usdcLabel ?? "USDC"
  const sim = input.simulated ? " (simulated when testnet leg is off)" : ""

  let steps: ProcessStep[] = []

  if (corridor.destinationKind === "collection") {
    steps = [
      {
        id: "local-pay",
        title: `Customer pays in ${corridor.localCurrency}`,
        detail: `Inbound via ${corridor.localRail}. ${local}`,
        status: "pending",
      },
      {
        id: "rail-confirm",
        title: `${corridor.localRail} confirms`,
        detail: "Local rail sandbox / partner marks the charge paid.",
        status: "pending",
      },
      {
        id: "bank-credit",
        title: "Credit the branch bank account",
        detail: `The settled local-rail amount is posted to the destination operating account${sim}.`,
        status: "pending",
      },
      {
        id: "available",
        title: "Available in Sancus",
        detail: "The branch bank balance updates; its cross-border wallet remains separate.",
        status: "pending",
      },
    ]
  } else if (corridor.destinationKind === "internal") {
    steps = [
      { id: "bank-debit", title: "Debit source operating account", detail: "Reserve and capture the source branch's local bank funds.", status: "pending" },
      { id: "usdc", title: "Move USDC on Arc", detail: "Use wallet liquidity only for the cross-border transport leg.", status: "pending", explorerUrl: explorer },
      { id: "bank-credit", title: "Credit destination operating account", detail: "Post the converted amount to the receiving branch bank account.", status: "pending" },
    ]
  } else if (corridor.destinationKind === "card") {
    steps = [
      {
        id: "authorize",
        title: `${corridor.localCurrency} authorization hold`,
        detail: `Reserve ${local} against the issuing branch's ${corridor.localCurrency} balance. Parent Treasury is not used.`,
        status: "pending",
      },
      {
        id: "card-network",
        title: "Card network clearing",
        detail: "The card provider clears the merchant transaction through the card's normal local issuing rail.",
        status: "pending",
      },
      {
        id: "settle",
        title: "Settle from issuing branch",
        detail: `Deduct the final ${corridor.localCurrency} amount from the branch that issued the card; release the hold on decline or reversal.`,
        status: "pending",
      },
    ]
  } else {
    // Outbound bank / local rail
    const needsFx = corridor.localCurrency !== "USD" && corridor.localCurrency !== "USDC"
    steps = [
      {
        id: "onramp",
        title: "USD → fUSDC",
        detail: "On-ramp into treasury Face USDC on Arc (rail-bot mintable test token).",
        status: "pending",
        explorerUrl: needsFx ? null : explorer,
      },
      {
        id: "offramp",
        title: needsFx ? `fUSDC → ${corridor.localCurrency}` : "fUSDC ready for domestic rail",
        detail: needsFx
          ? `Off-ramp: convert Face USDC to ${corridor.localCurrency} for local settlement.`
          : "US payment: fUSDC stays 1:1 with USD before the ACH leg.",
        status: "pending",
        explorerUrl: explorer,
      },
      {
        id: "local-rail",
        title: `${corridor.localRail} to bank`,
        detail:
          corridor.localRail.includes("ACH")
            ? `US ACH pushes USD to the beneficiary bank account${sim}.`
            : `Large payment: send via ${corridor.localRail} to the payee's bank / proxy${sim}.`,
        status: "pending",
      },
      {
        id: "arrived",
        title: "Arrived / settling",
        detail: `${local} with the recipient. ${usdc} debited from treasury.`,
        status: "pending",
      },
    ]
  }

  const failedAt = input.status === "Failed" ? Math.min(1, steps.length - 1) : undefined
  steps = steps.map((s, i) => ({
    ...s,
    status: s.status === "skipped" ? "skipped" : stepStatus(input.status, i, steps.length, failedAt),
  }))

  return { corridor, steps }
}

/** Demo rows so Process is never empty before live activity exists. */
export function demoProcessSeeds(): Array<{
  id: string
  at: string
  who: string
  amount: string
  amountUsd: number
  rail: string
  status: "Settled" | "Pending"
  localAmountLabel: string
  usdcLabel: string
  inbound?: boolean
  destinationKind?: DestinationKind
  currency?: string
  txHash?: string
}> {
  const day = new Date()
  const iso = (h: number) => {
    const d = new Date(day)
    d.setHours(h, 12, 0, 0)
    return d.toISOString()
  }
  return [
    {
      id: "demo-ach",
      at: iso(9),
      who: "Northwind Supplies",
      amount: "−$1,250.00",
      amountUsd: 1250,
      rail: "ACH",
      status: "Settled",
      localAmountLabel: "US$ 1,250.00",
      usdcLabel: "1,250.00 USDC",
    },
    {
      id: "demo-pix",
      at: iso(11),
      who: "Café do Sertão Ltda",
      amount: "−$420.00",
      amountUsd: 420,
      rail: "Pix",
      status: "Settled",
      localAmountLabel: "R$ 2.280,00",
      usdcLabel: "420.00 USDC",
    },
    {
      id: "demo-card",
      at: iso(13),
      who: "Warung Bu Sri",
      amount: "−Rp294,400",
      amountUsd: 18.4,
      rail: "Card",
      status: "Settled",
      localAmountLabel: "Rp294,400",
      usdcLabel: "18.40 USDC",
      destinationKind: "card",
      currency: "IDR",
    },
    {
      id: "demo-promptpay",
      at: iso(15),
      who: "Siam Packaging Co.",
      amount: "−$86.00",
      amountUsd: 86,
      rail: "PromptPay",
      status: "Pending",
      localAmountLabel: "฿ 3,010.00",
      usdcLabel: "86.00 USDC",
    },
    {
      id: "demo-qris-in",
      at: iso(16),
      who: "QRIS customer",
      amount: "+Rp 250.000",
      amountUsd: 15,
      rail: "QRIS",
      status: "Settled",
      localAmountLabel: "Rp 250.000",
      usdcLabel: "minted mIDR",
      inbound: true,
    },
  ]
}
