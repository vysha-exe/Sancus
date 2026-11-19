"use client"

import QRCode from "qrcode"
import { useEffect, useMemo, useState } from "react"

type StaticReceiveLink = {
  id: string
  companyId: string
  companyName: string
  rail: "QRIS" | "PROMPTPAY" | "PIX" | "USDC"
  currency: string
  publicToken: string
}

export function StaticReceiveLinks() {
  const [links, setLinks] = useState<StaticReceiveLink[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [qrUrl, setQrUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = links.find((link) => link.id === selectedId) ?? links[0] ?? null
  const publicUrl = useMemo(() => selected && typeof window !== "undefined" ? `${window.location.origin}/r/${selected.publicToken}` : "", [selected])

  useEffect(() => {
    void fetch("/api/sancus/receive-links", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { links?: StaticReceiveLink[]; error?: string }
        if (!response.ok) throw new Error(body.error || "Could not load static receive links")
        setLinks(body.links ?? [])
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load static receive links"))
  }, [])

  useEffect(() => {
    let current = true
    if (!publicUrl) return
    void QRCode.toDataURL(publicUrl, { width: 260, margin: 1, errorCorrectionLevel: "M" }).then((value) => {
      if (current) setQrUrl(value)
    })
    return () => { current = false }
  }, [publicUrl])

  async function copy() {
    if (!publicUrl) return
    await navigator.clipboard.writeText(publicUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="tile s12" aria-labelledby="static-receive-links">
      <div className="tile-head">
        <div><h2 className="tile-title" id="static-receive-links">Reusable organization QR</h2><p className="body-s muted" style={{ margin: "4px 0 0" }}>This QR never changes. The payer scans it, chooses an amount, and receives a provider-issued payment QR.</p></div>
        <span className="sx-pill sx-pill--settled">Static</span>
      </div>
      {error ? <p role="alert" className="body-s" style={{ color: "var(--danger, #c0392b)" }}>{error}</p> : null}
      {selected ? <div className="grid" style={{ alignItems: "start", gap: 20 }}>
        <div className="s7" style={{ display: "grid", gap: 16 }}>
          <label className="sx-field"><span className="sx-label">Organization and receive rail</span><select className="sx-field__input" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{links.map((link) => <option key={link.id} value={link.id}>{link.companyName} · {link.rail} · {link.currency}</option>)}</select><span className="sx-field__help">One permanent link is stored for every organization.</span></label>
          <div className="tile-foot" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}><button type="button" className="sx-btn sx-btn--secondary" onClick={copy}>{copied ? "Copied" : "Copy payment link"}</button><a className="sx-btn sx-btn--secondary" href={publicUrl} target="_blank" rel="noreferrer">Open payer page</a></div>
        </div>
        <aside className="tile s5" style={{ alignItems: "center", textAlign: "center" }}>{qrUrl ? <>
          {/* Locally generated data URL for this permanent payment link. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl} alt={`Static receive QR for ${selected.companyName}`} width={240} height={240} style={{ background: "white", borderRadius: 12, padding: 8 }} />
        </> : null}<strong>{selected.companyName}</strong><span className="body-s muted">{selected.rail} · payer chooses the amount</span></aside>
      </div> : <div className="empty">Add an organization to receive its permanent QR.</div>}
    </section>
  )
}
