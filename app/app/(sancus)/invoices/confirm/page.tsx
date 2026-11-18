"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useMemo, useState } from "react"

function ConfirmInner() {
  const params = useSearchParams()
  const router = useRouter()
  const fileName = params.get("file") || "torrefacao-TL-118.pdf"

  const seed = useMemo(() => {
    const lower = fileName.toLowerCase()
    if (lower.includes("northwind") || lower.includes("nw-")) {
      return {
        supplier: "Northwind Supply Co.",
        invoice: "NW-2291",
        amount: "2,000.00",
        currency: "USD",
        due: "November 30",
        rail: "ACH",
        iban: "",
        bic: "",
        theyGet: "$2,000.00",
        youPay: "$2,000.00",
        fee: "$0.00",
        matched: true,
        checkDue: false,
        checkIban: false,
      }
    }
    return {
      supplier: "Torrefação Lisboa",
      invoice: "TL-118",
      amount: "1.840,00",
      currency: "EUR",
      due: "December 5",
      rail: "SEPA",
      iban: "PT50 0035 0651 0001 2345 6781 9",
      bic: "CGDIPTPL",
      theyGet: "€ 1.840,00",
      youPay: "$1,988.00",
      fee: "$0.80",
      matched: true,
      checkDue: true,
      checkIban: true,
    }
  }, [fileName])

  const [supplier, setSupplier] = useState(seed.supplier)
  const [invoice, setInvoice] = useState(seed.invoice)
  const [amount, setAmount] = useState(seed.amount)
  const [currency, setCurrency] = useState(seed.currency)
  const [due, setDue] = useState(seed.due)
  const [rail, setRail] = useState(seed.rail)
  const [iban, setIban] = useState(seed.iban)
  const [bic, setBic] = useState(seed.bic)
  const [reference, setReference] = useState(seed.invoice)

  const checks = (seed.checkDue ? 1 : 0) + (seed.checkIban ? 1 : 0)

  return (
    <div className="page">
      <header className="page-head flowhead">
        <div className="title">
          <Link href="/invoices" className="icon-btn" aria-label="Back to Invoices">
            ←
          </Link>
          <h1 className="sx-h heading-2">Confirm invoice</h1>
        </div>
        <ol className="steps" aria-label="Pay an invoice">
          <li className="done">1 Upload</li>
          <li aria-current="step">2 Confirm</li>
          <li>3 Pay</li>
        </ol>
      </header>

      <div className="grid">
        <section className="tile s7" aria-labelledby="read">
          <div className="tile-head">
            <h2 className="tile-title" id="read">
              Read from {fileName}
            </h2>
            {seed.matched ? <span className="sx-pill sx-pill--settled">Supplier matched</span> : null}
          </div>
          <div className="grid" style={{ gap: 14 }}>
            <label className="sx-field s6">
              <span className="sx-label">Supplier</span>
              <input className="sx-field__input" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Invoice number</span>
              <input className="sx-field__input" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Amount</span>
              <input
                className="sx-field__input"
                style={{ fontFamily: "var(--font-mono)" }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Currency</span>
              <select className="sx-field__input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">EUR · euro</option>
                <option value="USD">USD · US dollar</option>
                <option value="BRL">BRL · real</option>
              </select>
            </label>
            <label className={`sx-field s6${seed.checkDue ? " sx-field--error" : ""}`}>
              <span className="sx-label">Due date</span>
              <input className="sx-field__input" value={due} onChange={(e) => setDue(e.target.value)} />
              {seed.checkDue ? (
                <span className="sx-field__help">Low confidence · check against the invoice</span>
              ) : null}
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Pay by</span>
              <select className="sx-field__input" value={rail} onChange={(e) => setRail(e.target.value)}>
                <option value="SEPA">SEPA transfer</option>
                <option value="ACH">ACH</option>
                <option value="USDC">USDC</option>
              </select>
            </label>
            {iban ? (
              <label className={`sx-field s12${seed.checkIban ? " sx-field--error" : ""}`}>
                <span className="sx-label">IBAN</span>
                <input
                  className="sx-field__input"
                  style={{ fontFamily: "var(--font-mono)" }}
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                />
                {seed.checkIban ? (
                  <span className="sx-field__help">Low confidence · last digit was blurred</span>
                ) : null}
              </label>
            ) : null}
            {bic ? (
              <label className="sx-field s6">
                <span className="sx-label">BIC</span>
                <input
                  className="sx-field__input"
                  style={{ fontFamily: "var(--font-mono)" }}
                  value={bic}
                  onChange={(e) => setBic(e.target.value)}
                />
              </label>
            ) : null}
            <label className="sx-field s6">
              <span className="sx-label">Reference</span>
              <input className="sx-field__input" value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              {checks > 0 ? `${checks} fields to check` : "Check the details before you pay"}
            </span>
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => router.push("/invoices")}>
              Upload a different file
            </button>
          </div>
        </section>

        <section className="tile s5" aria-labelledby="sum">
          <div
            className="empty"
            style={{ minHeight: 120, marginBottom: 12, background: "var(--surface-000)", border: "1px dashed var(--line)" }}
            role="img"
            aria-label="Invoice preview"
          >
            <span className="data">{supplier.toUpperCase()}</span>
            <span className="data">{seed.theyGet}</span>
          </div>
          <h2 className="tile-title" id="sum">
            Payment
          </h2>
          <div className="kv">
            <span>They get</span>
            <span>{seed.theyGet}</span>
          </div>
          <div className="kv">
            <span>You pay</span>
            <span>{seed.youPay}</span>
          </div>
          <div className="kv">
            <span>Fee</span>
            <span>{seed.fee}</span>
          </div>
          <div className="kv">
            <span>Rail</span>
            <span className="pills">
              <span className="sx-rail">{rail}</span>
            </span>
          </div>
          <div className="kv">
            <span>Approval</span>
            <span>Over $1,000 · Owner or Finance</span>
          </div>
          <div className="tile-foot">
            <Link href="/pay/review" className="sx-btn sx-btn--primary" style={{ flex: "1 1 auto" }}>
              Pay
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function InvoiceConfirmPage() {
  return (
    <Suspense fallback={<div className="page">Loading…</div>}>
      <ConfirmInner />
    </Suspense>
  )
}
