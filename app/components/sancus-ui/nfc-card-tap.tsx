"use client"

// Android ↔ Android NFC tap for virtual cards (hackathon PoC).
// Merchant: Chrome Web NFC scan. Payer: signed token hosted via the Android HCE companion (or written to a tag).
import { useCallback, useEffect, useRef, useState } from "react"
import { createNdefReader, nfcDeepLink, tokenFromNdefRecords, webNfcAvailable, NFC_RECORD_TYPE } from "@/lib/sancus/nfc-card-client"

type Card = {
  id: string
  lastFour: string
  status: string
  employeeName: string
}

type Mode = "pay" | "accept"

export function NfcCardTap({ card, onPaid }: { card: Card; onPaid: () => void }) {
  const [mode, setMode] = useState<Mode>("pay")
  const [merchant, setMerchant] = useState("NFC tap · Sancus demo")
  const [amount, setAmount] = useState("12.50")
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [nfcOk, setNfcOk] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setNfcOk(webNfcAvailable())
  }, [])

  useEffect(() => () => abortRef.current?.abort(), [])

  const stopListen = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setListening(false)
  }, [])

  async function preparePay() {
    const n = Number(amount)
    if (!(n > 0)) return setError("Enter an amount")
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const res = await fetch("/api/sancus/nfc/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, amount: n, merchantName: merchant }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Couldn't prepare NFC tap")
      setToken(body.token)
      setDeepLink(body.deepLink ?? nfcDeepLink(body.token))
      setStatus(`Ready to tap · $${n.toFixed(2)} · expires in ~2 min`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function writeToTag() {
    if (!token) return setError("Prepare a tap first")
    const reader = createNdefReader()
    if (!reader) return setError("Web NFC isn't available in this browser (use Chrome on Android)")
    setBusy(true)
    setError(null)
    try {
      await reader.write({
        records: [
          { recordType: "mime", mediaType: NFC_RECORD_TYPE, data: token },
          { recordType: "text", data: token },
        ],
      })
      setStatus("Wrote NFC tag. Merchant can scan it — or use the companion app for phone-to-phone.")
    } catch (e) {
      setError((e as Error).message || "NFC write failed — hold an NFC tag to this phone")
    } finally {
      setBusy(false)
    }
  }

  async function chargeToken(scanned: string, merchantOverride?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/sancus/nfc/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: scanned, merchantName: merchantOverride || merchant }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "NFC charge declined")
      setStatus(
        `Approved $${Number(body.amount).toFixed(2)} · ${body.payerName} ···${body.lastFour}` +
          (body.purchase?.txHash ? " · settled on Arc" : "")
      )
      onPaid()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function startAccept() {
    const reader = createNdefReader()
    if (!reader) {
      setError("Web NFC needs Chrome on Android with NFC on. Use Simulate tap on the payer phone for desktop demos.")
      return
    }
    stopListen()
    const ac = new AbortController()
    abortRef.current = ac
    setListening(true)
    setError(null)
    setStatus("Hold the payer's phone to this one…")
    try {
      reader.onreading = (event) => {
        const scanned = tokenFromNdefRecords(event.message.records)
        if (!scanned) {
          setError("NFC tag read, but it wasn't a Sancus card tap")
          return
        }
        stopListen()
        void chargeToken(scanned)
      }
      reader.onreadingerror = () => setError("Couldn't read that NFC tap — try again")
      await reader.scan({ signal: ac.signal })
    } catch (e) {
      if ((e as Error).name === "AbortError") return
      setListening(false)
      setError((e as Error).message || "NFC scan failed")
    }
  }

  async function simulateTap() {
    // Same-device demo: prepare intent then charge it (no radios). Useful when only one phone / desktop.
    const n = Number(amount)
    if (!(n > 0)) return setError("Enter an amount")
    setBusy(true)
    setError(null)
    try {
      const intentRes = await fetch("/api/sancus/nfc/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card.id, amount: n, merchantName: merchant }),
      })
      const intentBody = await intentRes.json()
      if (!intentRes.ok) throw new Error(intentBody.error ?? "Couldn't prepare tap")
      setToken(intentBody.token)
      await chargeToken(intentBody.token, merchant)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <h2 className="sx-h heading-3" style={{ margin: 0 }}>NFC tap</h2>
        <span className="sx-pill">{nfcOk ? "Web NFC ready" : "No Web NFC · use companion / simulate"}</span>
      </div>
      <p className="body-s muted" style={{ margin: 0 }}>
        Android → Android over the NFC radio. Settlement uses your Sancus virtual card (not Visa/Mastercard SoftPOS).
      </p>

      <div className="filters" role="group" aria-label="NFC role">
        <button type="button" className="chip" aria-pressed={mode === "pay"} onClick={() => { stopListen(); setMode("pay") }}>
          Pay (this card)
        </button>
        <button type="button" className="chip" aria-pressed={mode === "accept"} onClick={() => setMode("accept")}>
          Accept tap (merchant)
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Merchant</span>
          <input className="sx-field__input" value={merchant} onChange={(e) => setMerchant(e.target.value)} maxLength={120} />
        </label>
        <label className="sx-field" style={{ margin: 0 }}>
          <span className="sx-label">Amount (USD)</span>
          <input
            className="sx-field__input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="12.50"
          />
        </label>
      </div>

      {mode === "pay" ? (
        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            className="sx-btn sx-btn--primary"
            disabled={busy || card.status !== "ACTIVE"}
            onClick={() => void preparePay()}
            style={{ justifySelf: "start" }}
          >
            {busy ? "Preparing…" : `Ready to tap ···${card.lastFour}`}
          </button>
          {token ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {deepLink ? (
                <a className="sx-btn sx-btn--secondary" href={deepLink}>
                  Open Android NFC companion
                </a>
              ) : null}
              <button type="button" className="sx-btn sx-btn--secondary" disabled={busy || !nfcOk} onClick={() => void writeToTag()}>
                Write NFC tag
              </button>
              <button type="button" className="sx-btn sx-btn--quiet" disabled={busy} onClick={() => void simulateTap()}>
                Simulate tap (same device)
              </button>
            </div>
          ) : (
            <button type="button" className="sx-btn sx-btn--quiet" disabled={busy} onClick={() => void simulateTap()} style={{ justifySelf: "start" }}>
              Simulate tap (same device)
            </button>
          )}
          <p className="body-s muted" style={{ margin: 0 }}>
            Phone-to-phone: install the companion in <code>nfc-android/</code>, tap <b>Open Android NFC companion</b>, then hold this phone to the merchant phone running <b>Accept tap</b>.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {listening ? (
            <button type="button" className="sx-btn sx-btn--secondary" onClick={stopListen} style={{ justifySelf: "start" }}>
              Cancel listening
            </button>
          ) : (
            <button type="button" className="sx-btn sx-btn--primary" disabled={busy} onClick={() => void startAccept()} style={{ justifySelf: "start" }}>
              {busy ? "Charging…" : "Listen for NFC tap"}
            </button>
          )}
          <p className="body-s muted" style={{ margin: 0 }}>
            Use Chrome on Android with NFC enabled. Keep this screen open while the payer taps.
          </p>
        </div>
      )}

      {status ? (
        <p className="body-s" role="status" style={{ margin: 0, color: "var(--settled)" }}>
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
