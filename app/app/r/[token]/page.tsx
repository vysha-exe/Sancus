"use client"

import QRCode from "qrcode"
import { use, useEffect, useState } from "react"
import type { CollectionDto, CollectionRail } from "@/lib/sancus/local-rails"

type LinkDetails = {
  companyName: string
  rail: CollectionRail | "USDC"
  currency: string
  minAmount?: number
  maxAmount?: number
  walletAddress?: string | null
}

export default function PublicReceivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [details, setDetails] = useState<LinkDetails | null>(null)
  const [amount, setAmount] = useState("")
  const [collection, setCollection] = useState<CollectionDto | null>(null)
  const [walletQr, setWalletQr] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/public/receive/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { receiveLink?: LinkDetails; error?: string }
        if (!response.ok || !body.receiveLink) throw new Error(body.error || "This receive link is unavailable")
        setDetails(body.receiveLink)
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "This receive link is unavailable"))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    let current = true
    if (details?.rail !== "USDC" || !details.walletAddress) return
    void QRCode.toDataURL(details.walletAddress, { width: 300, margin: 1, errorCorrectionLevel: "M" }).then((value) => {
      if (current) setWalletQr(value)
    })
    return () => { current = false }
  }, [details])

  async function createPayment() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/public/receive/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount: Number(amount) }),
      })
      const body = await response.json() as { collection?: CollectionDto; error?: string }
      if (!response.ok || !body.collection) throw new Error(body.error || "Could not create payment QR")
      setCollection(body.collection)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create payment QR")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f1f3ef", color: "#12231f" }}>
      <section style={{ width: "min(100%, 520px)", display: "grid", gap: 24, padding: 32, border: "1px solid #ced7d1", borderRadius: 18, background: "white", boxShadow: "0 18px 60px rgba(20,45,38,.08)" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontFamily: "monospace", letterSpacing: ".14em", textTransform: "uppercase", color: "#267e70" }}>Sancus secure payment</span>
          <h1 style={{ margin: 0, fontFamily: "serif", fontSize: 38 }}>{details?.companyName || "Payment link"}</h1>
          {details ? <p style={{ margin: 0, color: "#63716d" }}>{details.rail === "USDC" ? "Scan the permanent wallet QR and choose the USDC amount in your wallet." : <>Choose how much to send. Sancus will create a real {details.rail === "PROMPTPAY" ? "PromptPay" : details.rail === "PIX" ? "Pix" : "QRIS"} payment QR in {details.currency}.</>}</p> : null}
        </div>

        {loading ? <p>Loading payment link…</p> : null}
        {error ? <p role="alert" style={{ margin: 0, color: "#b54135" }}>{error}</p> : null}
        {details?.rail === "USDC" ? <div style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center" }}>
          {walletQr ? <>
            {/* Locally generated QR for the permanent Arc wallet address. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={walletQr} alt={`${details.companyName} USDC wallet QR`} width={280} height={280} style={{ background: "white", padding: 8, borderRadius: 12 }} />
          </> : null}
          {details.walletAddress ? <><code style={{ maxWidth: "100%", overflowWrap: "anywhere" }}>{details.walletAddress}</code><button type="button" onClick={() => navigator.clipboard.writeText(details.walletAddress!)} style={{ padding: "10px 16px", border: "1px solid #91a29c", borderRadius: 999, background: "white" }}>Copy USDC address</button></> : <p>This organization does not have a wallet yet.</p>}
          <span style={{ color: "#63716d" }}>Arc testnet · the payer chooses the amount</span>
        </div> : null}
        {details && details.rail !== "USDC" && !collection ? <>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700 }}>Amount · {details.currency}</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0" style={{ padding: "16px 18px", border: "1px solid #91a29c", borderRadius: 10, fontSize: 28 }} />
            <small style={{ color: "#63716d" }}>Between {details.minAmount?.toLocaleString()} and {details.maxAmount?.toLocaleString()} {details.currency}</small>
          </label>
          <button type="button" onClick={createPayment} disabled={busy || Number(amount) <= 0} style={{ padding: "15px 20px", border: 0, borderRadius: 999, background: "#168777", color: "white", fontSize: 17, fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating secure QR…" : "Continue to payment"}</button>
        </> : null}

        {collection ? <div style={{ display: "grid", justifyItems: "center", gap: 14, textAlign: "center" }}>
          {collection.qrImageUrl ? <>
            {/* Provider QR hosts differ by rail and can be data URLs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={collection.qrImageUrl} alt={`${collection.rail} payment QR`} width={280} height={280} style={{ background: "white", padding: 8, borderRadius: 12 }} />
          </> : null}
          <strong style={{ fontSize: 20 }}>{details?.currency} {amount}</strong>
          <span style={{ color: "#63716d" }}>Scan this provider-issued QR to complete the payment.</span>
          {collection.qrPayload ? <button type="button" onClick={() => navigator.clipboard.writeText(collection.qrPayload!)} style={{ padding: "10px 16px", border: "1px solid #91a29c", borderRadius: 999, background: "white" }}>Copy Pix code</button> : null}
        </div> : null}
      </section>
    </main>
  )
}
