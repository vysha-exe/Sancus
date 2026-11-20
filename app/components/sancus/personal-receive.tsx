"use client"

import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"
import { accountDisplayName, useAccount } from "@/lib/sancus/use-account"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function parseAmount(raw: string): number {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Personal "Show my QR": the user's own Arc USDC wallet as a scannable code. */
export function PersonalReceive() {
  const { account } = useAccount()
  const name = accountDisplayName(account, "You")
  const treasury = useLiveTreasury()
  const wallet = treasury.summary?.wallets.find((w) => w.blockchain === "ARC-TESTNET")
  const address = wallet?.address ?? ""

  const [qrUrl, setQrUrl] = useState("")
  const [amount, setAmount] = useState("")
  const [copied, setCopied] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const requested = parseAmount(amount)

  // The QR opens a public "Pay <name>" page, so a phone camera has something to show.
  const payUrl = useMemo(() => {
    if (!address || typeof window === "undefined") return ""
    const query = new URLSearchParams({ name })
    if (requested) query.set("amount", requested.toFixed(2))
    return `${window.location.origin}/u/${address}?${query.toString()}`
  }, [address, name, requested])

  useEffect(() => {
    if (!payUrl) return
    let current = true
    void QRCode.toDataURL(payUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" }).then((value: string) => {
      if (current) setQrUrl(value)
    })
    return () => {
      current = false
    }
  }, [payUrl])

  async function copyAddress() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setShareNote("Couldn't copy. Select the address and copy it by hand.")
    }
  }

  async function share() {
    if (!payUrl) return
    const ask = requested ? `Please send ${money.format(requested)} USDC` : "Send me USDC"
    const text = `${ask} on Arc to ${name}: ${payUrl}`
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `Pay ${name}`, text: `${ask} on Arc to ${name}`, url: payUrl })
        return
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareNote("Payment request copied. Paste it into a message.")
    } catch {
      setShareNote("Sharing isn't available here. Copy the address instead.")
    }
    window.setTimeout(() => setShareNote(null), 2500)
  }

  return (
    <div className="grid" style={{ alignItems: "start" }}>
      <section className="tile s5" aria-labelledby="my-qr" style={{ alignItems: "center", textAlign: "center" }}>
        <h2 className="tile-title" id="my-qr" style={{ justifySelf: "stretch", textAlign: "left" }}>
          My QR
        </h2>
        {treasury.loading ? (
          <div className="qr" role="img" aria-label="Loading your QR code">
            <span className="sx-label">Loading…</span>
          </div>
        ) : qrUrl ? (
          <>
            {/* Locally generated data URL for the user's own wallet address. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt={`QR code for ${name}'s USDC address`} width={240} height={240} style={{ background: "white", borderRadius: 12, padding: 8, maxWidth: "100%", height: "auto" }} />
          </>
        ) : (
          <div className="empty">Your wallet isn&apos;t set up yet. Refresh in a moment, or open Treasury to finish setup.</div>
        )}
        <strong>{name}</strong>
        <span className="body-s muted">{requested ? `Requesting ${money.format(requested)} USDC` : "Payer chooses the amount"}</span>
      </section>

      <section className="tile s7" aria-labelledby="share-qr">
        <h2 className="tile-title" id="share-qr">
          Share it
        </h2>
        <label className="sx-field">
          <span className="sx-label">Request an amount (optional)</span>
          <input
            className="sx-field__input sx-field__amount"
            value={amount}
            inputMode="decimal"
            placeholder="$0.00"
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="sx-field__help">Added to your QR and the link you share. The payer still enters it when they send.</span>
        </label>
        <div className="kv">
          <span>Network</span>
          <span className="data">
            <span className="sx-rail">USDC</span> Arc
          </span>
        </div>
        <div className="kv">
          <span>Address</span>
          <span className="data" style={{ wordBreak: "break-all", textAlign: "right" }}>
            {treasury.loading ? "Loading…" : address || "Not available yet"}
          </span>
        </div>
        <div className="tile-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button type="button" className="sx-btn sx-btn--primary" disabled={!address} onClick={share}>
            Share
          </button>
          <button type="button" className="sx-btn sx-btn--secondary" disabled={!address} onClick={copyAddress}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <span className="body-s muted" role="status">
            {shareNote}
          </span>
        </div>
        <p className="body-s muted" style={{ margin: 0 }}>
          Only send USDC on Arc to this address. Other coins or networks can be lost.
        </p>
      </section>
    </div>
  )
}
