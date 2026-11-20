"use client"

// Pay flow state shared by /pay → /pay/amount → /pay/review → /pay/done.
//
// Every payee is quoted from USDC at the live rate (POST /api/sancus/pay/quote). Payees with
// payout details are LIVE: Thailand (PromptPay) and Indonesia (BI-FAST) are paid through Xendit
// (POST /api/sancus/xendit/payouts), Brazil by Pix (POST /api/sancus/pix/payments). Others
// (US bank, USDC address) stay demo-only here; US banks are paid from Pay > US bank.

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
import { useAccount } from "@/lib/sancus/use-account"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"
import type { PixPaymentDto } from "@/lib/sancus/local-rails"
import type { InternalTransferDto } from "@/lib/sancus/internal-transfers"
import { defaultCurrency, isPayRail, type PayCurrency, type QuoteSide, type SerializedPayQuote } from "@/lib/sancus/pay-quote"
import type { CompanyNode } from "@/lib/sancus/companies"
import { orgCompaniesAsRecipients } from "@/lib/sancus/org-payees"
import { useWorkspace } from "@/lib/sancus/use-workspace"
import { signalSancusDataChanged } from "@/lib/sancus/live-refresh"
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

/** Display-ready numbers for the current recipient. */
export type PayView = {
  /** The payee can be paid for real (Xendit or Pix); otherwise the flow is a demo. */
  live: boolean
  currency: string
  usdLabel: string
  feeLabel: string
  totalLabel: string
  localLabel: string
  rateLabel: string
  arrival: string
  railReason: string | null
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
  quoteLoading: boolean
  quoteError: string | null
  refreshQuote: () => void
  submit: () => Promise<SubmitResult>
  submitting: boolean
  xenditPayout: XenditPayoutDto | null
  pixPayment: PixPaymentDto | null
  internalTransfer: InternalTransferDto | null
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

/** A typed local amount as a number: "1,234.56", "1.234,56" (pt-BR / id-ID) or "750.000" (IDR). */
function localAmountNumber(v: string): number {
  const t = v.trim().replace(/\s/g, "")
  const lastComma = t.lastIndexOf(",")
  const lastDot = t.lastIndexOf(".")
  if (lastComma > lastDot) return Number.parseFloat(t.replace(/\./g, "").replace(",", "."))
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number.parseFloat(t.replace(/\./g, ""))
  return Number.parseFloat(t.replace(/,/g, ""))
}

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

export const PAYMENT_LINK_PAYEE_PREFIX = "link-usdc-"

/** A payee built from `?to=<0x address>&name=…&amount=…` (a personal payment link). Not saved. */
function paymentLinkPayee(search: string): { recipient: Recipient; amount: string } | null {
  const query = new URLSearchParams(search)
  const address = query.get("to") ?? ""
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null
  const name = (query.get("name") ?? "").trim().slice(0, 40) || "Payment link"
  const amountNumber = Number.parseFloat(query.get("amount") ?? "")
  const amount = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber < 1_000_000 ? amountNumber.toFixed(2) : ""
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`
  const initials = name.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"
  return {
    amount,
    recipient: {
      id: `${PAYMENT_LINK_PAYEE_PREFIX}${address.toLowerCase()}`,
      name,
      initials,
      kind: "Friend",
      detail: `Friend · USDC address ${short}`,
      rail: "USDC",
      country: "Arc network",
      methods: [{ rail: "USDC", detail: short, tag: "Default" }],
      history: "From a payment link",
    },
  }
}

export function PayFlowProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace()
  const [state, setState] = useState<PayState>(defaultState)
  const [customPayees, setCustomPayees] = useState<Recipient[]>([])
  const [quoteNonce, setQuoteNonce] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [xenditPayout, setXenditPayout] = useState<XenditPayoutDto | null>(null)
  const [pixPayment, setPixPayment] = useState<PixPaymentDto | null>(null)
  const [internalTransfer, setInternalTransfer] = useState<InternalTransferDto | null>(null)
  // One idempotency key per payment attempt: retries can't double-pay.
  const idempotencyKey = useRef<string | null>(null)

  const [invoice, setInvoice] = useState<PayInvoice | null>(null)
  // True once saved payees / payment-link / invoice preselection below has run.
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInitialized(true)
      const saved = loadCustomPayees()

      // Arrived from a personal payment link (/u/<address> → "Open it to pay"): preselect that
      // USDC address and amount. USDC-address payees are demo-only, so this payment is simulated.
      const linkPayee = paymentLinkPayee(window.location.search)
      if (linkPayee) {
        setCustomPayees([linkPayee.recipient, ...saved.filter((r) => r.id !== linkPayee.recipient.id)])
        setState((s) => ({
          ...s,
          recipientId: linkPayee.recipient.id,
          rail: linkPayee.recipient.rail,
          usdAmount: linkPayee.amount,
          localAmount: "",
          side: "send",
        }))
        return
      }
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
      const railName = match.rail
      const matchCurrency = payoutCurrency(match.rail, railName)
      setState((s) => ({
        ...s,
        recipientId: match.id,
        rail: railName,
        memo: invoiceContext.invoiceNumber ? `Invoice ${invoiceContext.invoiceNumber}` : s.memo,
        ...(invoiceContext.currency === "USD"
          ? { usdAmount: amountText, localAmount: "", side: "send" as const }
          : matchCurrency === invoiceContext.currency
            ? { localAmount: amountText, usdAmount: "", side: "receive" as const }
            : { usdAmount: "", localAmount: "", side: "send" as const }),
      }))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  // Personal: friends/shops. Business: suppliers + other companies in the org as internal payees.
  const { account } = useAccount()
  const personal = account?.type === "INDIVIDUAL"
  const sourceAccounts = useMemo(
    () => flattenCompanies(workspace.tree).filter((company) => company.role !== null && company.can.pay),
    [workspace.tree]
  )
  const sourceAccount = sourceAccounts.find((company) => company.id === workspace.companyId)
    ?? sourceAccounts.find((company) => company.parentId === null)
    ?? sourceAccounts[0]
    ?? null
  const orgPayees = useMemo(
    () => (personal ? [] : orgCompaniesAsRecipients(workspace.tree, { excludeCompanyId: sourceAccount?.id ?? workspace.companyId })),
    [personal, workspace.tree, workspace.companyId, sourceAccount?.id]
  )
  const recipients = useMemo(
    () => [...orgPayees, ...customPayees, ...recipientsFor(personal)],
    [orgPayees, customPayees, personal]
  )
  const recipient = recipients.find((r) => r.id === state.recipientId) ?? recipients[0]!
  const isPix = Boolean(recipient.pixKey)
  const isOrg = Boolean(recipient.companyId)
  const isLive = Boolean(recipient.xendit) || isPix || isOrg

  const setSourceCompanyId = useCallback((id: string) => {
    if (!sourceAccounts.some((company) => company.id === id)) return
    idempotencyKey.current = null
    workspace.selectCompany(id)
  }, [sourceAccounts, workspace])

  const setRecipientId = useCallback(
    (id: string) => {
      const r = recipients.find((item) => item.id === id) ?? findRecipient(id, customPayees) ?? recipients[0]!
      idempotencyKey.current = null
      setState((s) => ({
        ...s,
        recipientId: r.id,
        rail: r.rail,
        localAmount: "",
        usdAmount: "",
        side: "send",
      }))
    },
    [customPayees, recipients]
  )

  // The default payee isn't in this account's list (e.g. a personal account): select its first one.
  // Waits for the preselection above, so it can't overwrite a payment-link or invoice payee.
  useEffect(() => {
    if (!initialized || recipient.id === state.recipientId) return
    const timer = window.setTimeout(() => setRecipientId(recipient.id), 0)
    return () => window.clearTimeout(timer)
  }, [initialized, recipient.id, state.recipientId, setRecipientId])

  const addPayee = useCallback((input: NewPayeeInput) => {
    const built = buildCustomPayee(input)
    if (!built.ok) return { ok: false as const, error: built.error }
    const payee = built.recipient
    setCustomPayees((prev) => {
      const next = [payee, ...prev]
      saveCustomPayees(next)
      return next
    })
    idempotencyKey.current = null
    setState((s) => ({ ...s, recipientId: payee.id, rail: payee.rail, localAmount: "", usdAmount: "", side: "send" }))
    return { ok: true as const, recipient: payee }
  }, [])

  const setUsdAmount = useCallback((v: string) => {
    idempotencyKey.current = null
    setState((s) => ({ ...s, usdAmount: v, side: "send" }))
  }, [])

  const setLocalAmount = useCallback((v: string) => {
    idempotencyKey.current = null
    setState((s) => ({ ...s, localAmount: v, side: "receive" }))
  }, [])

  const setRail = useCallback((v: string) => setState((s) => ({ ...s, rail: v })), [])
  const setMemo = useCallback((v: string) => setState((s) => ({ ...s, memo: v })), [])
  const refreshQuote = useCallback(() => setQuoteNonce((n) => n + 1), [])

  // USDC-based quote from POST /api/sancus/pay/quote, in either direction, at the live rate.
  const [railQuote, setRailQuote] = useState<SerializedPayQuote | null>(null)
  const [railQuoteError, setRailQuoteError] = useState<string | null>(null)
  const [railQuoteLoading, setRailQuoteLoading] = useState(false)
  const currency = payoutCurrency(recipient.rail, state.rail)
  const typed = state.side === "send" ? state.usdAmount : state.localAmount
  useEffect(() => {
    if (!currency || !isPayRail(state.rail) || !typed.trim()) return
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
  }, [currency, state.rail, state.side, typed, quoteNonce])

  const submit = useCallback(async (): Promise<SubmitResult> => {
    if (!isLive) return { ok: false, error: "This payee can't be paid from here yet" }
    idempotencyKey.current ??= newKey()
    setSubmitting(true)
    try {
      if (isOrg && recipient.companyId) {
        if (!sourceAccount) return { ok: false, error: "Pick which company you're paying from" }
        const amountUsdc = Number.parseFloat(state.usdAmount.replace(/,/g, ""))
        if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) return { ok: false, error: "Enter an amount in USDC" }
        const res = await fetch("/api/sancus/internal-transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
          body: JSON.stringify({
            sourceCompanyId: sourceAccount.id,
            destinationCompanyId: recipient.companyId,
            amountUsdc,
            memo: state.memo || undefined,
          }),
        })
        const body = (await res.json()) as { transfer?: InternalTransferDto; error?: string }
        // Mirror branch Move money: a 502 can still include the transfer row (FAILED with reason).
        if (!res.ok && !body.transfer) return { ok: false, error: body.error ?? "Internal transfer failed" }
        if (body.transfer) {
          setInternalTransfer(body.transfer)
          signalSancusDataChanged()
          idempotencyKey.current = null
          return { ok: true }
        }
        return { ok: false, error: body.error ?? "Internal transfer failed" }
      }

      const amount = localAmountNumber(state.localAmount)
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter an amount" }

      if (isPix) {
        const res = await fetch("/api/sancus/pix/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
          body: JSON.stringify({
            purpose: "SUPPLIER_PAYMENT",
            recipientName: recipient.name,
            amountBrl: amount,
            pixKey: recipient.pixKey,
            description: state.memo || "Sancus payment",
          }),
        })
        const body = await res.json()
        if (!res.ok) return { ok: false, error: body.error ?? "Pix payment failed" }
        setPixPayment(body.payment as PixPaymentDto)
        idempotencyKey.current = null
        return { ok: true }
      }
      const x = recipient.xendit!
      const res = await fetch("/api/sancus/xendit/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          purpose: "SUPPLIER_PAYMENT",
          rail: x.rail,
          recipientName: recipient.name,
          accountNumber: x.accountNumber,
          routingType: x.routingType,
          routingValue: x.routingValue,
          amount: x.currency === "IDR" ? Math.round(amount) : amount,
          description: (state.memo || "Sancus payment").slice(0, 100),
        }),
      })
      const body = await res.json()
      if (!res.ok) return { ok: false, error: body.error ?? "Payment failed" }
      setXenditPayout(body.payout as XenditPayoutDto)
      idempotencyKey.current = null
      return { ok: true }
    } catch {
      // Keep the key: retrying the same attempt can't create a second payout.
      return { ok: false, error: "Network error. Retrying is safe; you won't be charged twice." }
    } finally {
      setSubmitting(false)
    }
  }, [recipient, state.localAmount, state.usdAmount, state.memo, isPix, isLive, isOrg, sourceAccount])

  const view = useMemo<PayView>(() => {
    const rq = railQuote && railQuote.rail === state.rail && railQuote.currency === currency ? railQuote : null
    return {
      live: isLive,
      currency: currency ?? "USD",
      usdLabel: rq?.amountLabel ?? "–",
      feeLabel: rq?.feeLabel ?? "–",
      totalLabel: rq?.sendLabel ?? "–",
      localLabel: rq?.receiveLabel ?? "–",
      rateLabel: rq?.rateLabel ?? (currency === "USDC" ? "USDC to USDC · no conversion" : "Getting a rate…"),
      arrival: rq?.eta ?? "–",
      railReason: null,
      simulated: true,
    }
  }, [isLive, state.rail, railQuote, currency])

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
      quoteLoading: railQuoteLoading,
      quoteError: railQuoteError,
      refreshQuote,
      submit,
      submitting,
      xenditPayout,
      pixPayment,
      internalTransfer,
      providerBacked: isLive,
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
      railQuoteLoading,
      railQuoteError,
      refreshQuote,
      submit,
      submitting,
      xenditPayout,
      pixPayment,
      internalTransfer,
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
