"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { ID_BANKS, type NewPayeeInput, type PayeeMethod } from "@/lib/sancus/custom-payees"
import { usePayFlow } from "@/lib/sancus/pay-flow"
import { useAccount } from "@/lib/sancus/use-account"

type Kind = NewPayeeInput["kind"]
const BUSINESS_KINDS: Kind[] = ["Supplier", "Contractor", "Team"]
const PERSONAL_KINDS: Kind[] = ["Friend", "Family", "Business"]
const METHODS: { id: PayeeMethod; label: string; field: string; placeholder: string; help: string }[] = [
  { id: "PROMPTPAY", label: "PromptPay · Thailand", field: "Thai mobile number", placeholder: "081 234 5678", help: "The mobile number registered with PromptPay" },
  { id: "BI_FAST", label: "Bank · Indonesia", field: "Account number", placeholder: "1234567890", help: "Paid by BI-FAST, usually within seconds" },
  { id: "PIX", label: "Pix · Brazil", field: "Pix key", placeholder: "email, phone, CPF/CNPJ or random key", help: "Paid by Pix, usually within seconds" },
]

export function AddPayeeSheet({ onClose }: { onClose: () => void }) {
  const { addPayee } = usePayFlow()
  const { account } = useAccount()
  const KINDS = account?.type === "INDIVIDUAL" ? PERSONAL_KINDS : BUSINESS_KINDS
  const [name, setName] = useState("")
  const [kind, setKind] = useState<Kind>(KINDS[0]!)
  const [method, setMethod] = useState<PayeeMethod>("PROMPTPAY")
  const [value, setValue] = useState("")
  const [bankSwift, setBankSwift] = useState<string>(ID_BANKS[0].swift)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const m = METHODS.find((x) => x.id === method) ?? METHODS[0]!

  function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = addPayee({ name, kind, method, value, bankSwift: method === "BI_FAST" ? bankSwift : undefined })
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
              placeholder="Siam Packaging Co."
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
              {METHODS.map((x) => (
                <button key={x.id} type="button" className="chip" aria-pressed={method === x.id} onClick={() => setMethod(x.id)}>
                  {x.label}
                </button>
              ))}
            </div>
          </div>

          {method === "BI_FAST" ? (
            <label className="sx-field">
              <span className="sx-label">Bank</span>
              <select className="sx-field__input" value={bankSwift} onChange={(e) => setBankSwift(e.target.value)}>
                {ID_BANKS.map((b) => (
                  <option key={b.swift} value={b.swift}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="sx-field">
            <span className="sx-label">{m.field}</span>
            <input className="sx-field__input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={m.placeholder} required />
            <span className="sx-field__help">{m.help}</span>
          </label>

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
