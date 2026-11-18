"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import type { ProxyType } from "@/lib/sancus/paynow"
import { usePayFlow } from "@/lib/sancus/pay-flow"

const KINDS = ["Supplier", "Contractor", "Team"] as const
const PROXY: { id: ProxyType; label: string; placeholder: string; help: string }[] = [
  { id: "MOBILE", label: "PayNow mobile", placeholder: "+65 9123 4567", help: "Singapore mobile registered with PayNow" },
  { id: "UEN", label: "PayNow UEN", placeholder: "201912345K", help: "Business UEN registered with PayNow" },
  { id: "BANK", label: "Bank account (FAST)", placeholder: "0123456789", help: "Account number at a Singapore bank" },
]

export function AddPayeeSheet({ onClose }: { onClose: () => void }) {
  const { addPayee } = usePayFlow()
  const [name, setName] = useState("")
  const [kind, setKind] = useState<(typeof KINDS)[number]>("Supplier")
  const [proxyType, setProxyType] = useState<ProxyType>("MOBILE")
  const [proxyValue, setProxyValue] = useState("")
  const [bankCode, setBankCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const proxy = PROXY.find((p) => p.id === proxyType) ?? PROXY[0]!

  function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = addPayee({
      name,
      kind,
      proxyType,
      proxyValue,
      bankCode: proxyType === "BANK" ? bankCode : undefined,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onClose()
  }

  return (
    <>
      <button type="button" className="scrim" aria-label="Close" onClick={onClose} />
      <section className="sheet sx" role="dialog" aria-modal="true" aria-labelledby="add-payee-t">
        <div className="sheet-head">
          <h2 className="sx-h heading-3" id="add-payee-t" style={{ margin: 0 }}>
            Add a payee
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form className="sheet-body" onSubmit={submit} id="add-payee-form">
          <label className="sx-field">
            <span className="sx-label">Name</span>
            <input
              className="sx-field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tan Logistics"
              required
              autoFocus
            />
          </label>

          <div className="sx-field">
            <span className="sx-label">Type</span>
            <div className="filters" role="group" aria-label="Payee type">
              {KINDS.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="sx-field">
            <span className="sx-label">How to pay them</span>
            <div className="filters" role="group" aria-label="Payment method">
              {PROXY.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={proxyType === p.id}
                  onClick={() => setProxyType(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="sx-field">
            <span className="sx-label">{proxy.label}</span>
            <input
              className="sx-field__input"
              value={proxyValue}
              onChange={(e) => setProxyValue(e.target.value)}
              placeholder={proxy.placeholder}
              required
            />
            <span className="sx-field__help">{proxy.help}</span>
          </label>

          {proxyType === "BANK" ? (
            <label className="sx-field">
              <span className="sx-label">Bank SWIFT</span>
              <input
                className="sx-field__input"
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value.toUpperCase())}
                placeholder="DBSSSGSG"
                required
              />
              <span className="sx-field__help">Singapore bank SWIFT / BIC, e.g. DBSSSGSG</span>
            </label>
          ) : null}

          {error ? (
            <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>
              {error}
            </span>
          ) : null}

          <p className="body-s muted" style={{ margin: 0 }}>
            Paying a US bank account instead?{" "}
            <Link href="/pay/us-bank" onClick={onClose}>
              Use US bank (ACH)
            </Link>
            .
          </p>
        </form>
        <div className="sheet-foot">
          <button type="button" className="sx-btn sx-btn--quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="add-payee-form" className="sx-btn sx-btn--primary" disabled={busy}>
            {busy ? "Saving…" : "Save payee"}
          </button>
        </div>
      </section>
    </>
  )
}
