"use client"

import { useEffect, useState } from "react"

type Details = { pan: string; expiration: string; cvv: string }

const groupedPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim()
const formattedExpiration = (expiration: string) => `${expiration.slice(0, 2)}/${expiration.slice(2)}`

export function CardDetailsDialog(props: {
  cardId: string
  holder: string
  onClose: () => void
}) {
  const { cardId, holder, onClose } = props
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/sancus/cards/${encodeURIComponent(cardId)}/details`, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { details?: Details; error?: string }
      if (!response.ok || !body.details) throw new Error(body.error || "Could not retrieve card details")
      setDetails(body.details)
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not retrieve card details")
    })
    const hideTimer = window.setTimeout(onClose, 60_000)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => {
      controller.abort()
      window.clearTimeout(hideTimer)
      window.removeEventListener("keydown", closeOnEscape)
    }
  }, [cardId, onClose])

  return (
    <div className="card-delete-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="card-delete-dialog card-details-dialog" role="dialog" aria-modal="true" aria-labelledby="card-details-title" aria-describedby="card-details-description">
        <div className="card-delete-dialog__head">
          <div>
            <span className="sx-label">Marqeta sandbox</span>
            <h2 className="sx-h heading-3" id="card-details-title">Card details</h2>
          </div>
          <button type="button" className="card-delete-dialog__close" aria-label="Hide card details" onClick={onClose}><span aria-hidden="true">×</span></button>
        </div>
        <p className="body-s muted" id="card-details-description">For sandbox test merchants only. These details hide automatically after one minute.</p>
        {error ? <p className="body-s card-delete-error" role="alert">{error}</p> : details ? (
          <div className="card-details-grid" aria-live="polite">
            <div className="card-details-pan"><span className="sx-label">Card number</span><span className="data">{groupedPan(details.pan)}</span></div>
            <div><span className="sx-label">Expiration</span><span className="data">{formattedExpiration(details.expiration)}</span></div>
            <div><span className="sx-label">Security code</span><span className="data">{details.cvv}</span></div>
            <div className="card-details-pan"><span className="sx-label">Cardholder</span><span className="data">{holder.toUpperCase()}</span></div>
          </div>
        ) : <div className="empty" role="status">Retrieving card details…</div>}
        <div className="card-delete-dialog__actions"><button type="button" className="sx-btn sx-btn--primary" onClick={onClose}>Done</button></div>
      </section>
    </div>
  )
}
