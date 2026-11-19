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
  getRecipient as getDemoRecipient,
  julianaQuote,
  recipients as demoRecipients,
  recipientsFor,
  type Recipient,
} from "@/lib/sancus/demo-data"
import { buildCustomPayee, loadCustomPayees, saveCustomPayees, type NewPayeeInput } from "@/lib/sancus/custom-payees"
import { validateRecipient } from "@/lib/sancus/paynow"
import { useAccount } from "@/lib/sancus/use-account"
import { displayMinor, parseToMinor, SGD_DECIMALS, USDC_DECIMALS } from "@/lib/sancus/money"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"
import type { SerializedQuote } from "@/lib/sancus/fx"
import type { PayoutDto } from "@/lib/sancus/payouts"
import { notifyApprovalsChanged } from "@/lib/sancus/use-live-approvals"
import type { PixPaymentDto } from "@/lib/sancus/local-rails"
import { defaultCurrency, isPayRail, type PayCurrency, type QuoteSide, type SerializedPayQuote } from "@/lib/sancus/pay-quote"
import type { CompanyNode } from "@/lib/sancus/companies"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { INVOICE_PAY_STORAGE_KEY, type InvoicePayContext } from "@/lib/sancus/invoices"

/** An invoice handed over from /invoices/confirm; `matched` is whether a saved payee was preselected. */
export type PayInvoice = InvoicePayContext & { matched: boolean }

const normalizeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

type PayState = {
  recipientId: string
  usdAmount: string
  localAmount: string
  rail: string
  memo: string
  /** Which box the user typed in last; the other one is computed from the quote. */
  side: QuoteSide
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
  /** Demo recipients plus any payees added on this device. */
  recipients: Recipient[]
  setRecipientId: (id: string) => void
  addPayee: (input: NewPayeeInput) => { ok: true; recipient: Recipient } | { ok: false; error: string }
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
  sourceAccounts: CompanyNode[]
  sourceAccount: CompanyNode | null
  sourceBalancesReady: boolean
  setSourceCompanyId: (id: string) => void
  /** Invoice the user is paying, if they arrived from the invoice confirm screen. */
  invoice: PayInvoice | null
}

const PayContext = createContext<PayContextValue | null>(null)

const defaultState: PayState = {
  recipientId: julianaQuote.recipientId,
  usdAmount: "",
  localAmount: "",
  rail: julianaQuote.rail,
  memo: "",
  side: "send",
}

function findRecipient(id: string, custom: Recipient[]): Recipient | undefined {
  return custom.find((r) => r.id === id) ?? getDemoRecipient(id)
}

/** Payout currency for a non-Singapore recipient on a rail (a wire follows their usual currency). */
function payoutCurrency(primaryRail: string, rail: string): PayCurrency | null {
  if (!isPayRail(rail)) return null
  if (rail === "Wire") return isPayRail(primaryRail) && primaryRail !== "Wire" ? defaultCurrency(primaryRail) : "USD"
  return defaultCurrency(rail)
}

const usd = (minor: bigint) => `$${displayMinor(minor, USDC_DECIMALS, "", 2)}`
const sgd = (minor: bigint) => `S$ ${displayMinor(minor, SGD_DECIMALS, "", 2)}`

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function flattenCompanies(nodes: CompanyNode[], out: CompanyNode[] = []) {
  for (const node of nodes) {
    out.push(node)
    flattenCompanies(node.children, out)
  }
  return out
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
  const workspace = useWorkspace()
  const [state, setState] = useState<PayState>(defaultState)
  const [customPayees, setCustomPayees] = useState<Recipient[]>([])
  const [liveQuote, setLiveQuote] = useState<LiveQuote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteNonce, setQuoteNonce] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [payout, setPayout] = useState<PayoutDto | null>(null)
  const [pixPayment, setPixPayment] = useState<PixPaymentDto | null>(null)
  // One idempotency key per payment attempt: retries can't double-pay.
  const idempotencyKey = useRef<string | null>(null)

  const [invoice, setInvoice] = useState<PayInvoice | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadCustomPayees()
      setCustomPayees(saved)

      // Arrived from an invoice: preselect the matching payee, memo and amount, once.
      let context: InvoicePayContext | null = null
      try {
        const raw = sessionStorage.getItem(INVOICE_PAY_STORAGE_KEY)
        if (raw) context = JSON.parse(raw) as InvoicePayContext
        sessionStorage.removeItem(INVOICE_PAY_STORAGE_KEY)
      } catch {
        context = null
      }
      if (!context?.supplier || !Number.isFinite(context.amount)) return
      const invoiceContext: InvoicePayContext = context
      const wanted = normalizeName(invoiceContext.supplier)
      const all = [...saved, ...demoRecipients]
      const match =
        all.find((r) => normalizeName(r.name) === wanted) ??
        (wanted.length >= 4 ? all.find((r) => { const n = normalizeName(r.name); return n.includes(wanted) || wanted.includes(n) }) : undefined)
      setInvoice({ ...invoiceContext, matched: Boolean(match) })
      if (!match) return
      const amountText = String(invoiceContext.amount)
      const railName = match.payout ? (match.payout.proxyType === "BANK" ? "FAST" : "PayNow") : match.rail
      const matchCurrency = match.payout ? null : payoutCurrency(match.rail, railName)
      setState((s) => ({
        ...s,
        recipientId: match.id,
        rail: railName,
        memo: invoiceContext.invoiceNumber ? `Invoice ${invoiceContext.invoiceNumber}` : s.memo,
        ...(invoiceContext.currency === "USD" && !match.payout
          ? { usdAmount: amountText, localAmount: "", side: "send" as const }
          : matchCurrency === invoiceContext.currency
            ? { localAmount: amountText, usdAmount: "", side: "receive" as const }
            : { usdAmount: "", localAmount: "", side: match.payout ? ("receive" as const) : ("send" as const) }),
      }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // Personal accounts (Jayden) get their own payees; business accounts get suppliers and team.
  const { account } = useAccount()
  const personal = account?.type === "INDIVIDUAL"
  const recipients = useMemo(() => [...customPayees, ...recipientsFor(personal)], [customPayees, personal])
  const recipient = recipients.find((r) => r.id === state.recipientId) ?? recipients[0]!
  const isLive = Boolean(recipient.payout)
  const isPix = recipient.id === "juliana"
  const sourceAccounts = useMemo(
    () => flattenCompanies(workspace.tree).filter((company) => company.role !== null && company.can.pay),
    [workspace.tree]
  )
  const sourceAccount = sourceAccounts.find((company) => company.id === workspace.companyId)
    ?? sourceAccounts.find((company) => company.parentId === null)
    ?? sourceAccounts[0]
    ?? null

  const setSourceCompanyId = useCallback((id: string) => {
    if (!sourceAccounts.some((company) => company.id === id)) return
    idempotencyKey.current = null
    workspace.selectCompany(id)
  }, [sourceAccounts, workspace])

  const setRecipientId = useCallback(
    (id: string) => {
      const r = findRecipient(id, customPayees) ?? recipients[0]!
      idempotencyKey.current = null
      setState((s) => ({
        ...s,
        recipientId: r.id,
        rail: r.payout ? (r.payout.proxyType === "BANK" ? "FAST" : "PayNow") : r.rail,
        localAmount: "",
        usdAmount: "",
        side: r.payout ? "receive" : "send",
      }))
    },
    [customPayees, recipients]
  )

  // The default payee isn't in this account's list (e.g. a personal account): select its first one.
  useEffect(() => {
    if (recipient.id === state.recipientId) return
    const timer = window.setTimeout(() => setRecipientId(recipient.id), 0)
    return () => window.clearTimeout(timer)
  }, [recipient.id, state.recipientId, setRecipientId])

  const addPayee = useCallback((input: NewPayeeInput) => {
    const issues = validateRecipient({
      name: input.name,
      proxyType: input.proxyType,
      proxyValue: input.proxyValue,
      bankCode: input.bankCode,
    })
    if (issues.length) return { ok: false as const, error: issues[0]!.message }
    const payee = buildCustomPayee(input)
    setCustomPayees((prev) => {
      const next = [payee, ...prev]
      saveCustomPayees(next)
      return next
    })
    idempotencyKey.current = null
    setState((s) => ({
      ...s,
      recipientId: payee.id,
      rail: payee.payout?.proxyType === "BANK" ? "FAST" : "PayNow",
      localAmount: "",
      usdAmount: "",
      side: "receive",
    }))
    return { ok: true as const, recipient: payee }
  }, [])

  const setUsdAmount = useCallback(
    (v: string) => {
      setState((s) => {
        const r = findRecipient(s.recipientId, customPayees)
        const n = Number.parseFloat(v.replace(/,/g, ""))
        if (r?.payout) {
          if (!Number.isFinite(n)) return { ...s, usdAmount: v }
          // No live rate yet: estimate "They get" at the fixed demo rate so the first live quote can
          // be requested (the quote API is priced in SGD). The quote callback below corrects it once it lands.
          if (!liveQuote) return { ...s, usdAmount: v, localAmount: Math.max(0, n * FIXED_USD_RATES.SGD).toFixed(2) }
          // Live: convert at the last quoted rate, net of the fee.
          const rate = Number.parseFloat(liveQuote.quote.clientRate)
          const fee = Number(liveQuote.quote.feeSgdMinor) / 100
          const local = Math.max(0, n * rate - fee)
          return { ...s, usdAmount: v, localAmount: local.toFixed(2) }
        }
        // Other rails: the quote API fills in "They get".
        return { ...s, usdAmount: v, side: "send" }
      })
    },
    [liveQuote, customPayees]
  )

  const setLocalAmount = useCallback(
    (v: string) => {
      idempotencyKey.current = null
      setState((s) => {
        const r = findRecipient(s.recipientId, customPayees)
        if (r?.payout) return { ...s, localAmount: v, usdAmount: "" }
        return { ...s, localAmount: v, side: "receive" }
      })
    },
    [customPayees]
  )

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
          const fresh = body as LiveQuote
          setLiveQuote(fresh)
          setQuoteError(null)
          // USDC typed first: re-derive "They get" from the USDC amount at the live rate, net of the
          // fee. That re-quotes once at the corrected SGD amount, then settles (same rate, same SGD).
          setState((s) => {
            const n = Number.parseFloat(s.usdAmount.replace(/,/g, ""))
            if (!s.usdAmount.trim() || !Number.isFinite(n)) return s
            const rate = Number.parseFloat(fresh.quote.clientRate)
            const fee = Number(fresh.quote.feeSgdMinor) / 100
            const local = Math.max(0, n * rate - fee).toFixed(2)
            return local === s.localAmount ? s : { ...s, localAmount: local }
          })
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

  // Every other rail: USDC-based quote from POST /api/sancus/pay/quote, in either direction.
  const [railQuote, setRailQuote] = useState<SerializedPayQuote | null>(null)
  const [railQuoteError, setRailQuoteError] = useState<string | null>(null)
  const [railQuoteLoading, setRailQuoteLoading] = useState(false)
  const currency = isLive ? null : payoutCurrency(recipient.rail, state.rail)
  const typed = state.side === "send" ? state.usdAmount : state.localAmount
  useEffect(() => {
    if (isLive || !currency || !isPayRail(state.rail) || !typed.trim()) return
    const controller = new AbortController()
    const side = state.side
    const timer = setTimeout(async () => {
      setRailQuoteLoading(true)
      try {
        const res = await fetch("/api/sancus/pay/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rail: state.rail, currency, side, amount: typed }),
          signal: controller.signal,
        })
        const body = await res.json()
        if (!res.ok) {
          setRailQuote(null)
          setRailQuoteError(body.error ?? "Could not get a quote")
          return
        }
        const q = body.quote as SerializedPayQuote
        setRailQuote(q)
        setRailQuoteError(null)
        // Fill in the box the user didn't type in.
        setState((s) => (s.side !== side ? s : side === "send" ? { ...s, localAmount: q.receiveInput } : { ...s, usdAmount: q.sendInput }))
      } catch (e) {
        if ((e as Error).name !== "AbortError") setRailQuoteError("Could not reach the quote service")
      } finally {
        setRailQuoteLoading(false)
      }
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [isLive, currency, state.rail, state.side, typed, quoteNonce])

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
        rateLabel: q ? `1 USDC = ${q.clientRate} SGD` : "Getting a live rate…",
        arrival: liveQuote?.etaLabel ?? "Seconds",
        railReason: liveQuote?.railReason ?? null,
        expiresAt: q?.expiresAt ?? null,
        simulated: true,
      }
    }
    const rq = railQuote && railQuote.rail === state.rail && railQuote.currency === currency ? railQuote : null
    return {
      live: false,
      currency: currency ?? "USD",
      usdLabel: rq?.amountLabel ?? "–",
      feeLabel: rq?.feeLabel ?? "–",
      totalLabel: rq?.sendLabel ?? "–",
      localLabel: rq?.receiveLabel ?? "–",
      rateLabel: rq?.rateLabel ?? (currency === "USDC" ? "USDC to USDC · no conversion" : "Getting a rate…"),
      arrival: rq?.eta ?? "–",
      railReason: null,
      expiresAt: null,
      simulated: true,
    }
  }, [isLive, liveQuote, state.localAmount, state.rail, railQuote, currency])

  const value = useMemo(
    () => ({
      state,
      recipient,
      recipients,
      setRecipientId,
      addPayee,
      setUsdAmount,
      setLocalAmount,
      setRail,
      setMemo,
      quote: julianaQuote,
      view,
      liveQuote: isLive ? liveQuote : null,
      quoteLoading: isLive ? quoteLoading : railQuoteLoading,
      quoteError: isLive ? quoteError : railQuoteError,
      refreshQuote,
      submit,
      submitting,
      payout,
      pixPayment,
      providerBacked: isLive || isPix,
      sourceAccounts,
      sourceAccount,
      sourceBalancesReady: workspace.balancesReady,
      setSourceCompanyId,
      invoice,
    }),
    [
      state,
      recipient,
      recipients,
      setRecipientId,
      addPayee,
      setUsdAmount,
      setLocalAmount,
      setRail,
      setMemo,
      view,
      isLive,
      liveQuote,
      quoteLoading,
      quoteError,
      railQuoteLoading,
      railQuoteError,
      refreshQuote,
      submit,
      submitting,
      payout,
      pixPayment,
      isPix,
      sourceAccounts,
      sourceAccount,
      workspace.balancesReady,
      setSourceCompanyId,
      invoice,
    ]
  )

  return <PayContext.Provider value={value}>{children}</PayContext.Provider>
}

export function usePayFlow(): PayContextValue {
  const ctx = useContext(PayContext)
  if (!ctx) throw new Error("usePayFlow must be used within PayFlowProvider")
  return ctx
}
