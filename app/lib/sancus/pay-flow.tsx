"use client"

// Pay flow state shared by /pay → /pay/amount → /pay/review → /pay/done.
//
// Recipients with `payout` details (Singapore PayNow / FAST) are LIVE: amounts
// are quoted by POST /api/sancus/payouts/quote and confirming creates a real
// payout with POST /api/sancus/payouts. Every other recipient keeps the demo
// quote from demo-data so the wireframe flow still works.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  getRecipient,
  julianaQuote,
  recipients,
  type Recipient,
} from "@/lib/sancus/demo-data"
import { displayMinor, parseToMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import type { SerializedQuote } from "@/lib/sancus/fx"
import type { PayoutDto } from "@/lib/sancus/payouts"
import { notifyApprovalsChanged } from "@/lib/sancus/use-live-approvals"
import type { PixPaymentDto } from "@/lib/sancus/local-rails"

type PayState = {
  recipientId: string
  usdAmount: string
  localAmount: string
  rail: string
  memo: string
}

export type LiveQuote = {
  quote: SerializedQuote
  rail: "PAYNOW" | "FAST"
  railReason: string
  etaLabel: string
}

/** Display-ready numbers for the current recipient, live or demo. */
export type PayView = {
  live: boolean
  currency: string
  usdLabel: string
  feeLabel: string
  totalLabel: string
  localLabel: string
  rateLabel: string
  arrival: string
  railReason: string | null
  /** ISO time the quoted rate expires (live only). */
  expiresAt: string | null
  /** Whether the payout leg is simulated (always true until a partner is live). */
  simulated: boolean
}

type SubmitResult = { ok: true } | { ok: false; error: string }

type PayContextValue = {
  state: PayState
  recipient: Recipient
  setRecipientId: (id: string) => void
  setUsdAmount: (v: string) => void
  setLocalAmount: (v: string) => void
  setRail: (v: string) => void
  setMemo: (v: string) => void
  /** Demo quote (kept for screens that still read it directly). */
  quote: typeof julianaQuote
  view: PayView
  liveQuote: LiveQuote | null
  quoteLoading: boolean
  quoteError: string | null
  refreshQuote: () => void
  submit: () => Promise<SubmitResult>
  submitting: boolean
  payout: PayoutDto | null
  pixPayment: PixPaymentDto | null
  providerBacked: boolean
}

const PayContext = createContext<PayContextValue | null>(null)

const defaultState: PayState = {
  recipientId: julianaQuote.recipientId,
  usdAmount: String(julianaQuote.usd),
  localAmount: String(julianaQuote.brl),
  rail: julianaQuote.rail,
  memo: "November design hours",
}

const LIVE_DEFAULT_SGD = "2000.00"

const usd = (minor: bigint) => `$${displayMinor(minor, USDC_DECIMALS, "", 2)}`
const sgd = (minor: bigint) => `S$ ${displayMinor(minor, SGD_DECIMALS, "", 2)}`

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** USDC share of the total that pays the partner fee (proportional to the SGD fee). */
function feeUsdcMinor(q: SerializedQuote): bigint {
  const total = BigInt(q.usdcAmountMinor)
  const fee = BigInt(q.feeSgdMinor)
  const amount = BigInt(q.sgdAmountMinor)
  if (fee <= 0n) return 0n
  return (total * fee + (amount + fee) - 1n) / (amount + fee)
}

export function PayFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PayState>(defaultState)
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteNonce, setQuoteNonce] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [payout, setPayout] = useState<PayoutDto | null>(null)
  const [pixPayment, setPixPayment] = useState<PixPaymentDto | null>(null)
  // One idempotency key per payment attempt: retries can't double-pay.
  const idempotencyKey = useRef<string | null>(null)

  const recipient = getRecipient(state.recipientId) ?? recipients[0]
  const isLive = Boolean(recipient.payout)
  const isPix = recipient.id === "juliana"

  const setRecipientId = useCallback((id: string) => {
    const r = getRecipient(id) ?? recipients[0]
    idempotencyKey.current = null
    setState((s) => ({
      ...s,
      recipientId: r.id,
      rail: r.payout ? (r.payout.proxyType === "BANK" ? "FAST" : "PayNow") : r.rail,
      localAmount: r.payout ? LIVE_DEFAULT_SGD : r.id === "juliana" ? String(julianaQuote.brl) : s.localAmount,
      usdAmount: r.payout ? "" : r.id === "juliana" ? String(julianaQuote.usd) : s.usdAmount,
    }))
  }, [])

  const setUsdAmount = useCallback(
    (v: string) => {
      setState((s) => {
        const r = getRecipient(s.recipientId)
        const n = Number.parseFloat(v.replace(/,/g, ""))
        if (r?.payout) {
          // Live: convert at the last quoted rate, net of the fee.
          if (!liveQuote || !Number.isFinite(n)) return { ...s, usdAmount: v }
          const rate = Number.parseFloat(liveQuote.quote.clientRate)
          const fee = Number(liveQuote.quote.feeSgdMinor) / 100
          const local = Math.max(0, n * rate - fee)
          return { ...s, usdAmount: v, localAmount: local.toFixed(2) }
        }
        const local =
          Number.isFinite(n) && s.recipientId === "juliana"
            ? (n * julianaQuote.rate).toFixed(2).replace(".", ",")
            : s.localAmount
        return { ...s, usdAmount: v, localAmount: local }
      })
    },
    [liveQuote]
  )

  const setLocalAmount = useCallback((v: string) => {
    idempotencyKey.current = null
    setState((s) => {
      const r = getRecipient(s.recipientId)
      if (r?.payout) return { ...s, localAmount: v, usdAmount: "" }
      const n = Number.parseFloat(v.replace(/\./g, "").replace(",", "."))
      const usdAmt =
        Number.isFinite(n) && s.recipientId === "juliana" ? (n / julianaQuote.rate).toFixed(2) : s.usdAmount
      return { ...s, localAmount: v, usdAmount: usdAmt }
    })
  }, [])

  const setRail = useCallback((v: string) => setState((s) => ({ ...s, rail: v })), [])
  const setMemo = useCallback((v: string) => setState((s) => ({ ...s, memo: v })), [])
  const refreshQuote = useCallback(() => setQuoteNonce((n) => n + 1), [])

  // Live quote: re-fetch when the recipient or amount changes (debounced) or on refresh.
  const quotable = isLive && parseToMinor(state.localAmount, SGD_DECIMALS) !== null
  useEffect(() => {
    if (!quotable || !recipient.payout) return
    const { proxyType, proxyValue, bankCode } = recipient.payout
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setQuoteLoading(true)
      try {
        const res = await fetch("/api/sancus/payouts/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { name: recipient.name, proxyType, proxyValue, bankCode },
            sgdAmount: state.localAmount,
          }),
          signal: controller.signal,
        })
        const body = await res.json()
        if (res.ok) {
          setLiveQuote(body as LiveQuote)
          setQuoteError(null)
        } else {
          setLiveQuote(null)
          setQuoteError(
            res.status === 401
              ? "Sign in to get a live quote (turn on demo login in .env.local)."
              : body.issues?.[0]?.message ?? body.error ?? "Could not get a quote"
          )
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setQuoteError("Could not reach the quote service")
      } finally {
        setQuoteLoading(false)
      }
    }, 350)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [quotable, recipient, state.localAmount, quoteNonce])

  const submit = useCallback(async (): Promise<SubmitResult> => {
    if (!recipient.payout && !isPix) return { ok: false, error: "This recipient is demo-only" }
    idempotencyKey.current ??= newKey()
    setSubmitting(true)
    try {
      if (isPix) {
        const amountBrl = Number.parseFloat(
          state.localAmount.includes(",")
            ? state.localAmount.replace(/\./g, "").replace(",", ".")
            : state.localAmount.replace(/,/g, "")
        )
        const res = await fetch("/api/sancus/pix/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
          body: JSON.stringify({
            purpose: "SUPPLIER_PAYMENT",
            recipientName: recipient.name,
            amountBrl,
            pixKey: "juliana.sandbox@example.com",
            description: state.memo || "Sancus supplier payment",
          }),
        })
        const body = await res.json()
        if (!res.ok) return { ok: false, error: body.error ?? "Pix payment failed" }
        setPixPayment(body.payment as PixPaymentDto)
        idempotencyKey.current = null
        return { ok: true }
      }
      if (!recipient.payout) return { ok: false, error: "This recipient is not configured for payout" }
      const res = await fetch("/api/sancus/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          recipient: {
            name: recipient.name,
            proxyType: recipient.payout.proxyType,
            proxyValue: recipient.payout.proxyValue,
            bankCode: recipient.payout.bankCode,
          },
          sgdAmount: state.localAmount,
          reference: state.memo || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) return { ok: false, error: body.issues?.[0]?.message ?? body.error ?? "Payment failed" }
      const created = body.payout as PayoutDto
      setPayout(created)
      if (created.status === "PENDING_APPROVAL") notifyApprovalsChanged()
      idempotencyKey.current = null
      return { ok: true }
    } catch {
      // Keep the key: retrying the same attempt can't create a second payout.
      return { ok: false, error: "Network error. Retrying is safe; you won't be charged twice." }
    } finally {
      setSubmitting(false)
    }
  }, [recipient, state.localAmount, state.memo, isPix])

  const view = useMemo<PayView>(() => {
    if (isLive) {
      const q = liveQuote?.quote
      const total = q ? BigInt(q.usdcAmountMinor) : null
      const fee = q ? feeUsdcMinor(q) : null
      const local = parseToMinor(state.localAmount, SGD_DECIMALS)
      return {
        live: true,
        currency: "SGD",
        usdLabel: total !== null && fee !== null ? usd(total - fee) : "–",
        feeLabel: fee !== null ? usd(fee) : "–",
        totalLabel: total !== null ? usd(total) : "–",
        localLabel: local !== null ? sgd(local) : "–",
        rateLabel: q ? `1 USD = ${q.clientRate} SGD` : "Getting a live rate…",
        arrival: liveQuote?.etaLabel ?? "Seconds",
        railReason: liveQuote?.railReason ?? null,
        expiresAt: q?.expiresAt ?? null,
        simulated: true,
      }
    }
    return {
      live: false,
      currency: "BRL",
      usdLabel: julianaQuote.usdLabel,
      feeLabel: julianaQuote.feeLabel,
      totalLabel: julianaQuote.totalLabel,
      localLabel: julianaQuote.brlLabel,
      rateLabel: julianaQuote.rateLabel,
      arrival: julianaQuote.arrival,
      railReason: null,
      expiresAt: null,
      simulated: true,
    }
  }, [isLive, liveQuote, state.localAmount])

  const value = useMemo(
    () => ({
      state,
      recipient,
      setRecipientId,
      setUsdAmount,
      setLocalAmount,
      setRail,
      setMemo,
      quote: julianaQuote,
      view,
      liveQuote: isLive ? liveQuote : null,
      quoteLoading: isLive && quoteLoading,
      quoteError: isLive ? quoteError : null,
      refreshQuote,
      submit,
      submitting,
      payout,
      pixPayment,
      providerBacked: isLive || isPix,
    }),
    [
      state,
      recipient,
      setRecipientId,
      setUsdAmount,
      setLocalAmount,
      setRail,
      setMemo,
      view,
      isLive,
      liveQuote,
      quoteLoading,
      quoteError,
      refreshQuote,
      submit,
      submitting,
      payout,
      pixPayment,
      isPix,
    ]
  )

  return <PayContext.Provider value={value}>{children}</PayContext.Provider>
}

export function usePayFlow(): PayContextValue {
  const ctx = useContext(PayContext)
  if (!ctx) throw new Error("usePayFlow must be used within PayFlowProvider")
  return ctx
}
