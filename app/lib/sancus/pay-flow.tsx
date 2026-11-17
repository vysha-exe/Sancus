"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  getRecipient,
  julianaQuote,
  recipients,
  type Recipient,
} from "@/lib/sancus/demo-data"

type PayState = {
  recipientId: string
  usdAmount: string
  localAmount: string
  rail: string
  memo: string
}

type PayContextValue = {
  state: PayState
  recipient: Recipient
  setRecipientId: (id: string) => void
  setUsdAmount: (v: string) => void
  setLocalAmount: (v: string) => void
  setRail: (v: string) => void
  setMemo: (v: string) => void
  quote: typeof julianaQuote
}

const PayContext = createContext<PayContextValue | null>(null)

const defaultState: PayState = {
  recipientId: julianaQuote.recipientId,
  usdAmount: String(julianaQuote.usd),
  localAmount: String(julianaQuote.brl),
  rail: julianaQuote.rail,
  memo: "November design hours",
}

export function PayFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PayState>(defaultState)

  const setRecipientId = useCallback((id: string) => {
    const r = getRecipient(id) ?? recipients[0]
    setState((s) => ({
      ...s,
      recipientId: r.id,
      rail: r.rail,
    }))
  }, [])

  const setUsdAmount = useCallback((v: string) => {
    setState((s) => {
      const n = Number.parseFloat(v.replace(/,/g, ""))
      const local =
        Number.isFinite(n) && s.recipientId === "juliana"
          ? (n * julianaQuote.rate).toFixed(2).replace(".", ",")
          : s.localAmount
      return { ...s, usdAmount: v, localAmount: local }
    })
  }, [])

  const setLocalAmount = useCallback((v: string) => {
    setState((s) => {
      const n = Number.parseFloat(v.replace(/\./g, "").replace(",", "."))
      const usd =
        Number.isFinite(n) && s.recipientId === "juliana"
          ? (n / julianaQuote.rate).toFixed(2)
          : s.usdAmount
      return { ...s, localAmount: v, usdAmount: usd }
    })
  }, [])

  const setRail = useCallback((v: string) => {
    setState((s) => ({ ...s, rail: v }))
  }, [])

  const setMemo = useCallback((v: string) => {
    setState((s) => ({ ...s, memo: v }))
  }, [])

  const recipient = getRecipient(state.recipientId) ?? recipients[0]

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
    }),
    [state, recipient, setRecipientId, setUsdAmount, setLocalAmount, setRail, setMemo],
  )

  return <PayContext.Provider value={value}>{children}</PayContext.Provider>
}

export function usePayFlow(): PayContextValue {
  const ctx = useContext(PayContext)
  if (!ctx) throw new Error("usePayFlow must be used within PayFlowProvider")
  return ctx
}
