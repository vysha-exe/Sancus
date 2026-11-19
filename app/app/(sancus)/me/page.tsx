"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { VirtualCard } from "@/components/sancus-ui/virtual-card"
import { CardDetailsDialog } from "@/components/sancus-ui/card-details-dialog"
import { countryByCode } from "@/lib/sancus/countries"
import type { XenditPayoutDto } from "@/lib/sancus/xendit-payouts"
import { useLiveApprovals } from "@/lib/sancus/use-live-approvals"

type Method = {
  id: string
  type: "CARD" | "PIX" | "QRIS" | "PROMPTPAY"
  provider: string
  label: string
  currency: string
  monthlyLimitMinor: string
  usedMinor: string
  status: string
  source: "CARD" | "SPENDING_METHOD"
  lastFour: string | null
  simulated?: boolean
}
type CardPurchase = {
  id: string; cardId: string | null; spendingMethodId: string | null; merchantName: string
  amountMinor: string; currency: string; status: "HELD" | "SETTLED" | "RELEASED" | "DECLINED"; authorizedAt: string
}
type PixPayment = {
  id: string; recipientName: string; amountBrlMinor: string
  status: "PENDING" | "SETTLED" | "FAILED" | "EXPIRED" | "CANCELLED"; createdAt: string
}
type Data = {
  firstName: string
  company: { id: string; name: string; country: string; role: string } | null
  limits: { perPaymentMinor: string | null; dailyMinor: string | null }
  methods: Method[]
  cardPurchases: CardPurchase[]
  pixPayments: PixPayment[]
  localPayments: XenditPayoutDto[]
}

const SYMBOL: Record<string, string> = { USD: "$", THB: "฿", IDR: "Rp ", BRL: "R$ " }
const scale = (currency: string) => currency === "JPY" || currency === "IDR" ? 1 : 100
const money = (minor: string, currency: string) => {
  const value = Number(minor) / scale(currency)
  return `${SYMBOL[currency] ?? ""}${value.toLocaleString(undefined, { maximumFractionDigits: currency === "IDR" || currency === "JPY" ? 0 : 2 })}${SYMBOL[currency] ? "" : ` ${currency}`}`
}
const usd6 = (minor: string | null) => minor ? `$${(Number(minor) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "No limit"
const fallbackLast4 = (id: string) => String(parseInt(id.replace(/-/g, "").slice(-6), 16) % 10000).padStart(4, "0")
const DEMO_PIX_QR = "00020101021226850014BR.GOV.BCB.PIX2563sancus.demo/pix/churrascaria5204000053039865802BR5920CHURRASCARIA DEMO6009SAO PAULO62070503***6304BEEF"
const DEMO_PROMPTPAY_QR = "00020101021229370016A0000006770101110113006691234567853037645406100.005802TH5913BANGKOK CAFE6007BANGKOK6304DEMO"

export default function EmployeePage() {
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [cardId, setCardId] = useState("")
  const [merchant, setMerchant] = useState("Office supply store")
  const [cardAmount, setCardAmount] = useState("25.00")
  const [cardBusy, setCardBusy] = useState(false)
  const [cardMessage, setCardMessage] = useState<string | null>(null)
  const [detailsCard, setDetailsCard] = useState<Method | null>(null)
  const closeCardDetails = useCallback(() => setDetailsCard(null), [])
  const [pixId, setPixId] = useState("")
  const [pixQr, setPixQr] = useState(DEMO_PIX_QR)
  const [pixRecipient, setPixRecipient] = useState("")
  const [pixAmount, setPixAmount] = useState("")
  const [pixBusy, setPixBusy] = useState(false)
  const [pixMessage, setPixMessage] = useState<string | null>(null)
  const [promptPayId, setPromptPayId] = useState("")
  const [promptPayQr, setPromptPayQr] = useState(DEMO_PROMPTPAY_QR)
  const [promptPayRecipient, setPromptPayRecipient] = useState("")
  const [promptPayAmount, setPromptPayAmount] = useState("")
  const [promptPayBusy, setPromptPayBusy] = useState(false)
  const [promptPayMessage, setPromptPayMessage] = useState<string | null>(null)
  const [promptPayPayout, setPromptPayPayout] = useState<XenditPayoutDto | null>(null)
  // Payments this employee asked for; an admin approves or declines each one.
  const approvals = useLiveApprovals()
  const requests = [...approvals.waiting, ...approvals.decided].filter((a) => a.live && a.mine)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sancus/accounts/me/employee", { cache: "no-store" })
      if (!res.ok) throw new Error()
      const body = await res.json() as Data
      setData(body)
      setCardId((current) => current || body.methods.find((method) => method.type === "CARD" && method.status === "ACTIVE")?.id || "")
      setPixId((current) => current || body.methods.find((method) => method.type === "PIX" && method.status === "ACTIVE")?.id || "")
      setState("ready")
    } catch {
      setState("error")
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const cards = useMemo(() => data?.methods.filter((method) => method.type === "CARD") ?? [], [data])
  const pixMethods = useMemo(() => data?.methods.filter((method) => method.type === "PIX") ?? [], [data])
  const otherQr = useMemo(() => data?.methods.filter((method) => method.type === "QRIS" || method.type === "PROMPTPAY") ?? [], [data])
  const promptPayMethods = useMemo(() => data?.methods.filter((method) => method.type === "PROMPTPAY") ?? [], [data])
  const selectedPromptPay = promptPayMethods[0] ?? null
  const selectedCard = cards.find((card) => card.id === cardId) ?? cards[0] ?? null
  const selectedPix = pixMethods.find((method) => method.id === pixId) ?? pixMethods[0] ?? null
  const where = data?.company ? `${countryByCode(data.company.country)?.flag ?? ""} ${data.company.name}` : ""

  async function spendCard(event: FormEvent) {
    event.preventDefault()
    if (!selectedCard) return
    setCardBusy(true)
    setCardMessage(null)
    try {
      const response = await fetch("/api/sancus/employee/card-purchases", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ methodId: selectedCard.id, source: selectedCard.source, merchantName: merchant, amount: Number(cardAmount) }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "The card was declined")
      setCardMessage("Authorized — the amount is on hold while the purchase settles.")
      await load()
      window.setTimeout(async () => {
        const settled = await fetch(`/api/sancus/employee/card-purchases/${body.purchase.id}/settle`, { method: "POST" })
        if (settled.ok) { setCardMessage("Purchase settled."); await load() }
      }, 1200)
    } catch (error) {
      setCardMessage(error instanceof Error ? error.message : "The card was declined")
    } finally {
      setCardBusy(false)
    }
  }

  async function readPixQr() {
    setPixBusy(true)
    setPixMessage(null)
    try {
      const response = await fetch("/api/sancus/pix/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ qrPayload: pixQr }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not read this Pix QR")
      setPixRecipient(body.recipientName)
      if (body.amount != null) setPixAmount(String(body.amount))
      setPixMessage("QR read. Review the recipient and amount before paying.")
    } catch (error) {
      setPixMessage(error instanceof Error ? error.message : "Could not read this Pix QR")
    } finally {
      setPixBusy(false)
    }
  }

  async function spendPix(event: FormEvent) {
    event.preventDefault()
    if (!selectedPix) return
    setPixBusy(true)
    setPixMessage(null)
    try {
      const response = await fetch("/api/sancus/employee/pix-payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spendingMethodId: selectedPix.id, recipientName: pixRecipient, amountBrl: Number(pixAmount), qrPayload: pixQr }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "The Pix payment was declined")
      setPixMessage(body.payment.status === "SETTLED" ? "Pix payment settled." : "Pix payment sent — waiting for settlement.")
      await load()
      if (body.payment.status === "PENDING") {
        window.setTimeout(async () => {
          const refreshed = await fetch(`/api/sancus/employee/pix-payments/${body.payment.id}/refresh`, { method: "POST" })
          if (refreshed.ok) {
            const result = await refreshed.json()
            setPixMessage(result.payment.status === "SETTLED" ? "Pix payment settled." : `Pix payment is ${String(result.payment.status).toLowerCase()}.`)
            await load()
          }
        }, 3500)
      }
    } catch (error) {
      setPixMessage(error instanceof Error ? error.message : "The Pix payment was declined")
    } finally {
      setPixBusy(false)
    }
  }

  function readPromptPayQr() {
    setPromptPayMessage(null)
    if (promptPayQr.trim().length < 20) {
      setPromptPayMessage("Paste the merchant's PromptPay QR payload first.")
      return
    }
    // Hackathon decoder: exposes the review step without pretending that Xendit resolves merchant QRs.
    setPromptPayRecipient("Bangkok Cafe")
    setPromptPayId("66912345678")
    setPromptPayAmount("100")
    setPromptPayMessage("QR read for the demo. Review the merchant and PromptPay destination before paying.")
  }

  async function spendPromptPay(event: FormEvent) {
    event.preventDefault()
    if (!selectedPromptPay) return
    setPromptPayBusy(true)
    setPromptPayMessage(null)
    try {
      const response = await fetch("/api/sancus/employee/local-payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spendingMethodId: selectedPromptPay.id, recipientName: promptPayRecipient,
          promptPayId, amountThb: Number(promptPayAmount), qrPayload: promptPayQr,
        }),
      })
      const body = await response.json() as { payout?: XenditPayoutDto; error?: string }
      if (!response.ok || !body.payout) throw new Error(body.error || "The PromptPay payment was declined")
      setPromptPayPayout(body.payout)
      setPromptPayMessage(body.payout.status === "SETTLED" ? "PromptPay payment settled." : "PromptPay payment submitted.")
      await load()
    } catch (error) {
      setPromptPayMessage(error instanceof Error ? error.message : "The PromptPay payment was declined")
    } finally {
      setPromptPayBusy(false)
    }
  }

  if (state === "error") return <div className="page"><div className="tile"><div className="empty">Couldn&apos;t load your employee portal. Refresh to try again.</div></div></div>

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="sx-label">Employee portal</span>
          <h1 className="sx-h heading-2">{data ? `Hi, ${data.firstName}` : "Loading…"}</h1>
          <p className="body-s muted" style={{ margin: 0 }}>{where ? `${where} · ` : ""}Use only the card and Pix access assigned to you.</p>
        </div>
        <Link href="/pay" className="sx-btn sx-btn--primary">Request a payment</Link>
      </header>

      <div className="grid">
        <section className="tile s6" aria-labelledby="employee-card">
          <div className="tile-head"><h2 className="tile-title" id="employee-card">Spend with card</h2>{selectedCard ? <span className={`sx-pill ${selectedCard.status === "ACTIVE" ? "sx-pill--settled" : ""}`}>{selectedCard.status}</span> : null}</div>
          {state === "loading" ? <div className="empty">Loading…</div> : selectedCard ? (
            <>
              {cards.length > 1 ? <label className="field"><span>Card</span><select value={selectedCard.id} onChange={(event) => setCardId(event.target.value)}>{cards.map((card) => <option value={card.id} key={card.id}>{card.label} · {card.currency}</option>)}</select></label> : null}
              <VirtualCard limit={`${money(selectedCard.monthlyLimitMinor, selectedCard.currency)}/MO`} name={(data?.firstName ?? "").toUpperCase()} num={`•••• •••• •••• ${selectedCard.lastFour ?? fallbackLast4(selectedCard.id)}`} ariaLabel={`Virtual card ending ${selectedCard.lastFour ?? fallbackLast4(selectedCard.id)}`} />
              {selectedCard.provider === "MARQETA" && !selectedCard.simulated ? <button type="button" className="sx-btn sx-btn--secondary" onClick={() => setDetailsCard(selectedCard)}>View card details</button> : null}
              <div className="kv"><span>Used this month</span><span>{money(selectedCard.usedMinor, selectedCard.currency)} of {money(selectedCard.monthlyLimitMinor, selectedCard.currency)}</span></div>
              <form onSubmit={spendCard} style={{ display: "grid", gap: 12 }}>
                <label className="field"><span>Merchant</span><input value={merchant} onChange={(event) => setMerchant(event.target.value)} required maxLength={120} /></label>
                <label className="field"><span>Amount ({selectedCard.currency})</span><input type="number" min="0.01" step={selectedCard.currency === "JPY" ? "1" : "0.01"} value={cardAmount} onChange={(event) => setCardAmount(event.target.value)} required /></label>
                <button type="submit" className="sx-btn sx-btn--primary" disabled={cardBusy || selectedCard.status !== "ACTIVE"}>{cardBusy ? "Authorizing…" : "Pay with card"}</button>
              </form>
              {cardMessage ? <div className="empty" role="status" style={{ marginTop: 12 }}>{cardMessage}</div> : null}
            </>
          ) : <div className="empty">No card is assigned to this login yet. Ask your admin to issue one from your team profile.</div>}
        </section>

        <section className="tile s6" aria-labelledby="employee-pix">
          <div className="tile-head"><h2 className="tile-title" id="employee-pix">Pay a Pix QR</h2>{selectedPix ? <span className={`sx-pill ${selectedPix.status === "ACTIVE" ? "sx-pill--settled" : ""}`}>{selectedPix.status}</span> : null}</div>
          {state === "loading" ? <div className="empty">Loading…</div> : selectedPix ? (
            <form onSubmit={spendPix} style={{ display: "grid", gap: 12 }}>
              {pixMethods.length > 1 ? <label className="field"><span>Pix access</span><select value={selectedPix.id} onChange={(event) => setPixId(event.target.value)}>{pixMethods.map((method) => <option value={method.id} key={method.id}>{method.label}</option>)}</select></label> : null}
              <div className="kv"><span>Used this month</span><span>{money(selectedPix.usedMinor, "BRL")} of {money(selectedPix.monthlyLimitMinor, "BRL")}</span></div>
              <label className="field"><span>Pix copy-and-paste QR code</span><textarea rows={4} value={pixQr} onChange={(event) => { setPixQr(event.target.value); setPixRecipient("") }} required minLength={20} /></label>
              <button type="button" className="sx-btn" onClick={readPixQr} disabled={pixBusy}>{pixBusy ? "Reading…" : "Read QR"}</button>
              {pixRecipient ? <><label className="field"><span>Recipient</span><input value={pixRecipient} readOnly /></label><label className="field"><span>Amount (BRL)</span><input type="number" min="0.01" max="5000" step="0.01" value={pixAmount} onChange={(event) => setPixAmount(event.target.value)} required /></label><button type="submit" className="sx-btn sx-btn--primary" disabled={pixBusy || selectedPix.status !== "ACTIVE"}>{pixBusy ? "Sending…" : `Pay ${pixAmount ? `R$ ${pixAmount}` : "with Pix"}`}</button></> : null}
              {pixMessage ? <div className="empty" role="status">{pixMessage}</div> : null}
            </form>
          ) : <div className="empty">No Pix access is assigned to this login yet. Your admin can issue it from your team profile.</div>}
          {otherQr.some((method) => method.type === "QRIS") ? <p className="body-s muted">QRIS access is assigned for Indonesia. Outbound QRIS merchant scanning remains simulated in this hackathon build.</p> : null}
        </section>

        {selectedPromptPay ? (
          <section className="tile s12" aria-labelledby="employee-promptpay">
            <div className="tile-head">
              <div>
                <h2 className="tile-title" id="employee-promptpay">Pay a Thai merchant</h2>
                <p className="body-s muted" style={{ margin: "4px 0 0" }}>Your admin issued PromptPay access. The QR identifies the merchant; Sancus applies your company limits and Xendit sends the THB payout.</p>
              </div>
              <span className={`sx-pill ${selectedPromptPay.status === "ACTIVE" ? "sx-pill--settled" : ""}`}>{selectedPromptPay.status}</span>
            </div>
            <form onSubmit={spendPromptPay} className="grid" style={{ gap: 12 }}>
              <div className="s7" style={{ display: "grid", gap: 12 }}>
                <div className="kv"><span>Used this month</span><span>{money(selectedPromptPay.usedMinor, "THB")} of {money(selectedPromptPay.monthlyLimitMinor, "THB")}</span></div>
                <label className="field"><span>Scan or paste merchant PromptPay QR</span><textarea rows={4} value={promptPayQr} onChange={(event) => { setPromptPayQr(event.target.value); setPromptPayRecipient(""); setPromptPayPayout(null) }} required minLength={20} /></label>
                <button type="button" className="sx-btn sx-btn--secondary" onClick={readPromptPayQr} disabled={promptPayBusy}>Read QR</button>
              </div>
              <div className="s5" style={{ display: "grid", gap: 12, alignContent: "start" }}>
                {promptPayRecipient ? <>
                  <label className="field"><span>Merchant</span><input value={promptPayRecipient} onChange={(event) => setPromptPayRecipient(event.target.value)} required /></label>
                  <label className="field"><span>PromptPay destination</span><input value={promptPayId} onChange={(event) => setPromptPayId(event.target.value)} required /></label>
                  <label className="field"><span>Amount (THB)</span><input type="number" min="1" step="0.01" value={promptPayAmount} onChange={(event) => setPromptPayAmount(event.target.value)} required /></label>
                  <button type="submit" className="sx-btn sx-btn--primary" disabled={promptPayBusy || selectedPromptPay.status !== "ACTIVE"}>{promptPayBusy ? "Sending…" : `Pay ${promptPayAmount ? `฿${promptPayAmount}` : "with PromptPay"}`}</button>
                </> : <div className="empty">Read the merchant QR to review who will be paid.</div>}
              </div>
            </form>
            {promptPayMessage ? <div className="empty" role="status" style={{ marginTop: 12 }}>{promptPayMessage}{promptPayPayout ? ` · ${promptPayPayout.simulated ? "Simulated fallback" : "Xendit test mode"}` : ""}</div> : null}
          </section>
        ) : null}

        <section className="tile s4" aria-labelledby="employee-limits">
          <div className="tile-head"><h2 className="tile-title" id="employee-limits">Your limits</h2><span className="body-s muted">Set by admin</span></div>
          <div className="kv"><span>Per payment</span><span className="body-strong">{usd6(data?.limits.perPaymentMinor ?? null)}</span></div>
          <div className="kv"><span>Per day</span><span className="body-strong">{usd6(data?.limits.dailyMinor ?? null)}</span></div>
        </section>

        <section className="tile s12" aria-labelledby="employee-requests">
          <div className="tile-head"><h2 className="tile-title" id="employee-requests">Your payment requests</h2><span className="body-s muted">An admin approves each one before money moves</span></div>
          {approvals.loading ? <div className="empty" aria-busy="true">Loading…</div> : requests.length ? requests.slice(0, 8).map((r) => (
            <div className="kv" key={r.id}>
              <span><span className="sx-rail">{r.rail}</span> {r.to}<span className="body-s muted" style={{ display: "block" }}>{r.when}</span></span>
              <span style={{ textAlign: "right" }}>{r.amountLabel}<span className="body-s muted" style={{ display: "block" }}>{r.decision === "approved" ? "Approved" : r.decision === "declined" ? "Declined" : "Waiting for an admin"}</span></span>
            </div>
          )) : <div className="empty">No requests yet. Use Request a payment to pay a supplier; an admin approves it.</div>}
        </section>

        <section className="tile s8" aria-labelledby="employee-activity">
          <div className="tile-head"><h2 className="tile-title" id="employee-activity">Recent spending</h2><span className="body-s muted">Authorizations and settled debits</span></div>
          {data && (data.cardPurchases.length || data.pixPayments.length || data.localPayments.length) ? [
            ...data.cardPurchases.map((purchase) => ({ id: `card-${purchase.id}`, name: purchase.merchantName, amount: money(purchase.amountMinor, purchase.currency), method: "Card", status: purchase.status, at: purchase.authorizedAt })),
            ...data.pixPayments.map((payment) => ({ id: `pix-${payment.id}`, name: payment.recipientName, amount: money(payment.amountBrlMinor, "BRL"), method: "Pix", status: payment.status, at: payment.createdAt })),
            ...data.localPayments.map((payment) => ({ id: `local-${payment.id}`, name: payment.recipientName, amount: money(payment.amountMinor, payment.currency), method: payment.rail === "PROMPTPAY" ? "PromptPay" : payment.rail, status: payment.status, at: payment.createdAt })),
          ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 8).map((row) => <div className="kv" key={row.id}><span><span className="sx-rail">{row.method}</span> {row.name}<span className="body-s muted" style={{ display: "block" }}>{new Date(row.at).toLocaleString()}</span></span><span style={{ textAlign: "right" }}>−{row.amount}<span className="body-s muted" style={{ display: "block" }}>{row.status}</span></span></div>) : <div className="empty">No employee purchases yet.</div>}
        </section>
      </div>

      {detailsCard ? <CardDetailsDialog
        cardId={detailsCard.id}
        holder={data?.firstName ?? "Cardholder"}
        onClose={closeCardDetails}
      /> : null}
    </div>
  )
}
