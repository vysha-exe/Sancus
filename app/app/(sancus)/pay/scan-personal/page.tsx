"use client"

// Pay › Scan (personal accounts only): scan a vendor's Pix, PromptPay or QRIS code, or tap a card terminal,
// choose how you pay in (rail A), and watch the money go: rail A → Sancus treasury → partner bank → rail B → vendor.
// Business accounts keep using /pay/scan (limits, approvals) and are sent back there.
// See lib/sancus/cross-rail.ts for the model. USDC → Pix uses the live Pix payment API; every other leg is simulated.
import "@/styles/sancus/cross-rail.css"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CrossRailRoute, type LegResult } from "@/components/sancus-ui/cross-rail-route"
import { QrScanner } from "@/components/sancus-ui/qr-scanner"
import { VirtualCard } from "@/components/sancus-ui/virtual-card"
import {
  COUNTRIES,
  FUNDING_SOURCES,
  RAILS,
  VENDORS,
  defaultSourceFor,
  formatMoney,
  parsePaymentQr,
  parsePos,
  payInParty,
  posUrl,
  quoteCrossRail,
  readReference,
  routeLegs,
  settlementRef,
  sourceById,
  vendorForQr,
  vendorQr,
  newTerminalRef,
  type CountryCode,
  type Vendor,
  type VendorRail,
} from "@/lib/sancus/cross-rail"
import { parseSancusQrUrl } from "@/lib/sancus/sancus-qr-parse"
import { publishTerminal } from "@/lib/sancus/terminal-channel"
import { useAccount } from "@/lib/sancus/use-account"

/** Demo individuals are US-based (see demo-accounts.ts), so rail A defaults to the US main rail. */
const HOME_COUNTRY: CountryCode = "US"
const CARD_LAST4 = "0417"

type Target = { vendor: Vendor; ref: string | null; amount: string | null; raw: string | null; known: boolean }
type Stage = "scan" | "review" | "processing" | "done"

const SCHEME_COUNTRY: Record<Exclude<VendorRail, "CARD">, CountryCode> = { PIX: "BR", PROMPTPAY: "TH", QRIS: "ID" }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(PT|CV|LTDA|CO)\.?$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "•"
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function PersonalScanWrapper() {
  return (
    <Suspense fallback={<div className="page" />}>
      <PersonalScanGate />
    </Suspense>
  )
}

/** Individuals only. Anyone else goes to the business scan screen, keeping a handed-over code. */
function PersonalScanGate() {
  const router = useRouter()
  const params = useSearchParams()
  const { account, ready } = useAccount()
  const personal = account?.type === "INDIVIDUAL"
  useEffect(() => {
    if (!ready || personal) return
    const code = params.get("code")
    router.replace(code ? `/pay/scan?code=${encodeURIComponent(code)}` : "/pay/scan")
  }, [ready, personal, params, router])
  if (!ready || !personal) return <div className="page" />
  return <PersonalScan firstName={account?.firstName ?? null} />
}

function PersonalScan({ firstName }: { firstName: string | null }) {
  const router = useRouter()
  const params = useSearchParams()
  const payerName = firstName?.trim() || "A Sancus member"

  const [stage, setStage] = useState<Stage>("scan")
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [amount, setAmount] = useState("")
  const [sourceId, setSourceId] = useState(defaultSourceFor(HOME_COUNTRY).id)
  const [active, setActive] = useState(-1)
  const [results, setResults] = useState<Record<number, LegResult>>({})
  const [failedAt, setFailedAt] = useState<number | null>(null)
  const [paidAt, setPaidAt] = useState<string | null>(null)
  const key = useRef<string | null>(null)

  const load = useCallback(
    (payload: string) => {
      const value = payload.trim()
      setError(null)
      const sancus = parseSancusQrUrl(value)
      if (sancus) return router.push(`/qr?pay=${encodeURIComponent(sancus)}`)

      const pos = parsePos(value)
      if (pos) {
        const vendor = VENDORS.find((v) => v.id === pos.m)!
        setTarget({ vendor, ref: pos.t, amount: pos.a, raw: null, known: true })
        setAmount(pos.a)
      } else if (/^000201/.test(value)) {
        const qr = parsePaymentQr(value)
        if (qr.scheme === "PAYNOW") return setError("Singapore PayNow codes aren't supported here yet.")
        if (qr.scheme === "UNKNOWN") return setError("That isn't a payment code we can read.")
        const known = vendorForQr(qr)
        const vendor: Vendor =
          known ?? {
            id: "scanned",
            name: qr.merchantName ? titleCase(qr.merchantName) : "Unnamed merchant",
            qrName: qr.merchantName ?? "",
            qrCity: qr.city ?? "",
            city: [qr.city ? titleCase(qr.city) : null, COUNTRIES[SCHEME_COUNTRY[qr.scheme]].name].filter(Boolean).join(", "),
            country: SCHEME_COUNTRY[qr.scheme],
            rail: qr.scheme,
            category: `${RAILS[qr.scheme].label} merchant`,
            initials: initials(qr.merchantName ?? ""),
            proxy: qr.proxy?.value ?? "",
            sampleAmount: "",
            terminalId: "QR",
          }
        setTarget({ vendor, ref: readReference(value), amount: qr.amount, raw: value, known: Boolean(known) })
        setAmount(qr.amount ?? "")
      } else {
        return setError("That isn't a Pix, PromptPay or QRIS code, or a Sancus card terminal.")
      }
      setText(value)
      setStage("review")
      setActive(-1)
      setResults({})
      setFailedAt(null)
      key.current = null
    },
    [router]
  )

  // Handed over from /qr (?code=000201…) or a card terminal link (?pos=…).
  const handed = params.get("code") ?? (params.get("pos") ? `/pay/scan-personal?pos=${params.get("pos")}` : null)
  useEffect(() => {
    if (!handed) return
    const t = setTimeout(() => load(handed), 0)
    return () => clearTimeout(t)
  }, [handed, load])

  const source = sourceById(sourceId)
  const value = Number(amount.replace(/,/g, ""))
  const quote = useMemo(() => (target && value > 0 ? quoteCrossRail(target.vendor, value, source) : null), [target, value, source])
  const legs = useMemo(() => (target && quote ? routeLegs(target.vendor, source, quote) : []), [target, quote, source])
  const isCard = target?.vendor.rail === "CARD"
  const liveLeg = source.rail === "USDC" && target?.vendor.rail === "PIX" && Boolean(target.raw)

  async function pay() {
    if (!target || !quote) return
    if (target.vendor.rail === "PIX" && liveLeg && value > 5000) return setError("Live Pix payments are capped at R$5,000 in the demo.")
    key.current ??= crypto.randomUUID()
    const seed = key.current.replace(/-/g, "")
    setError(null)
    setStage("processing")
    setFailedAt(null)
    setResults({})
    const vendor = target.vendor
    if (target.ref) {
      void publishTerminal({ type: "processing", ref: target.ref, payerName, sourceLabel: source.label, sourceRail: RAILS[source.rail].label })
    }

    // Live leg: USDC → Pix goes through the real Pix payment API (PayZu sandbox, or its simulated fallback).
    const live = liveLeg
      ? fetch("/api/sancus/pix/payments", {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": key.current },
          body: JSON.stringify({ purpose: "SUPPLIER_PAYMENT", recipientName: vendor.name.slice(0, 120), amountBrl: value, qrPayload: target.raw, description: "Cross-rail QR payment" }),
        })
          .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
          .catch(() => ({ ok: false, body: { error: "Network error. Try again." } }))
      : null

    const out: Record<number, LegResult> = {}
    for (let i = 0; i < legs.length; i++) {
      setActive(i)
      await sleep(legs[i]!.ms)
      if (i === 0) out[0] = { ref: settlementRef(source.rail, seed) }
      if (i === 1) out[1] = { ref: settlementRef("USDC", seed.slice(8) + seed) }
      if (i === 2) {
        out[2] = { ref: settlementRef(vendor.rail, seed.slice(4) + seed) }
        if (live) {
          const r = await live
          if (!r.ok) {
            setFailedAt(2)
            setError(String(r.body?.error ?? "The Pix payment failed."))
            key.current = null
            return
          }
          const p = r.body?.payment as { endToEndId?: string | null; providerTransactionId?: string; txHash?: string | null; explorer?: string | null } | undefined
          out[1] = p?.txHash ? { ref: `${p.txHash.slice(0, 18)}…`, href: p.explorer ?? undefined, live: true } : out[1]!
          out[2] = { ref: p?.endToEndId ?? p?.providerTransactionId ?? out[2]!.ref, live: true }
        }
      }
      setResults({ ...out })
    }
    setActive(legs.length)
    const at = new Date().toISOString()
    setPaidAt(at)
    setStage("done")
    if (target.ref) {
      void publishTerminal({
        type: "paid",
        ref: target.ref,
        payerName,
        sourceLabel: source.label,
        sourceRail: RAILS[source.rail].label,
        payInBank: payInParty(source),
        payoutBank: COUNTRIES[vendor.country].partnerBank,
        payoutRail: RAILS[vendor.rail].label,
        amountLabel: formatMoney(quote.vendorAmount, quote.vendorCurrency),
        settlementRef: out[2]?.ref ?? "",
        cardLast4: vendor.rail === "CARD" ? CARD_LAST4 : undefined,
        live: Boolean(live),
        at,
      })
    }
  }

  function reset() {
    setStage("scan")
    setTarget(null)
    setAmount("")
    setText("")
    setError(null)
    setActive(-1)
    setResults({})
    setFailedAt(null)
    key.current = null
    if (handed) router.replace("/pay/scan-personal")
  }

  const samples = useMemo(
    () =>
      VENDORS.map((v) => ({
        vendor: v,
        payload:
          v.rail === "CARD"
            ? posUrl(typeof window === "undefined" ? "" : window.location.origin, { t: newTerminalRef(), m: v.id, a: v.sampleAmount })
            : vendorQr(v, v.sampleAmount, newTerminalRef()),
      })),
    []
  )

  const fixedAmount = Boolean(target?.amount)
  const vendor = target?.vendor
  const vCur = vendor ? COUNTRIES[vendor.country].currency : "USD"

  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          {stage === "scan" ? (
            <Link href="/pay" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>
              ← Pay
            </Link>
          ) : stage === "review" ? (
            <button type="button" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }} onClick={reset}>
              ← Scan another
            </button>
          ) : null}
          <h1 className="sx-h heading-2">
            {stage === "scan" ? "Scan to pay" : stage === "review" ? "Choose how you pay" : stage === "processing" ? "Sending…" : "Paid"}
          </h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Pay any Pix, PromptPay or QRIS code, or tap a card terminal, with whichever account you like. Sancus moves it
            through the treasury and a local partner bank pays them on their own rail.
          </p>
        </div>
      </header>

      {stage === "scan" ? (
        <div className="grid">
          <section className="tile s7" aria-label="Scan">
            <QrScanner onResult={load} autoStart={!handed} hint="Point your camera at a Pix, PromptPay or QRIS code, or a card terminal" />
            <label className="sx-field" style={{ marginTop: 4 }}>
              <span className="sx-label">Or paste the code</span>
              <textarea className="sx-field__input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="000201010212…" style={{ paddingTop: 10 }} />
            </label>
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" style={{ justifySelf: "start" }} onClick={() => text.trim() && load(text)}>
              Read code
            </button>
            {error ? (
              <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>
                {error}
              </p>
            ) : null}
          </section>

          <aside className="tile s5" aria-label="Demo vendors">
            <div className="tile-head">
              <h2 className="tile-title">No code handy?</h2>
              <a href="/terminal" target="_blank" rel="noreferrer" className="sx-btn sx-btn--quiet">
                Open vendor terminals ↗
              </a>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {samples.map(({ vendor: v, payload }) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => load(payload)}
                  className="tile"
                  style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left", font: "inherit", color: "inherit" }}
                >
                  <span className="xr-vendor">
                    <span className="xr-avatar" aria-hidden>
                      {v.initials}
                    </span>
                    <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                      <span className="body-strong trunc">{v.name}</span>
                      <span className="body-s muted trunc">
                        {v.city} · {formatMoney(Number(v.sampleAmount), COUNTRIES[v.country].currency)}
                      </span>
                    </span>
                  </span>
                  <span className="xr-rail xr-rail--b">{RAILS[v.rail].label}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      {stage !== "scan" && vendor ? (
        <div className="grid">
          <section className="tile s7" aria-label="Payment">
            <div className="xr-vendor">
              <span className="xr-avatar" aria-hidden>
                {vendor.initials}
              </span>
              <div>
                <h2 className="sx-h heading-3" style={{ margin: 0 }}>
                  {vendor.name}
                </h2>
                <span className="body-s muted">
                  {vendor.category} · {vendor.city}
                </span>
              </div>
            </div>
            <div className="filters">
              <span className="xr-rail xr-rail--b">
                {RAILS[vendor.rail].label} · {COUNTRIES[vendor.country].name}
              </span>
              {target?.ref ? <span className="xr-rail">Terminal {vendor.terminalId}</span> : null}
              {!target?.known ? <span className="sx-pill sx-pill--simulated">Unlisted merchant</span> : null}
            </div>

            {stage === "done" && quote ? (
              <div className="xr-success" role="status">
                <span className="sx-label" style={{ color: "inherit" }}>
                  {isCard ? "Approved" : "Paid"}
                </span>
                <span className="sx-h heading-2">{formatMoney(quote.vendorAmount, quote.vendorCurrency)}</span>
                <span className="body-s" style={{ color: "var(--ink)" }}>
                  {vendor.name} got paid by {RAILS[vendor.rail].label} from {COUNTRIES[vendor.country].partnerBank}. You paid{" "}
                  {formatMoney(quote.sourceAmount, quote.sourceCurrency)} from {source.label}.
                </span>
                {paidAt ? <span className="body-s muted">{new Date(paidAt).toLocaleString()}</span> : null}
              </div>
            ) : (
              <>
                {isCard ? (
                  <div className="xr-card-wrap" data-tapping={stage === "processing"}>
                    <VirtualCard name={payerName.toUpperCase()} num={`•••• ${CARD_LAST4}`} limit="$5,000" mark />
                    <span className="body-s muted">
                      {stage === "processing" ? "Hold near the terminal…" : `Sancus card, funded by ${source.label}`}
                    </span>
                  </div>
                ) : null}

                <label className="sx-field" style={{ margin: 0 }}>
                  <span className="sx-label">They get ({vCur})</span>
                  <input
                    className="sx-field__input sx-field__amount"
                    inputMode="decimal"
                    value={amount}
                    readOnly={fixedAmount || stage !== "review"}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0.00"
                  />
                  {fixedAmount ? <span className="sx-field__help">Amount set by the {isCard ? "terminal" : "merchant"}.</span> : null}
                </label>

                <label className="sx-field" style={{ margin: 0 }}>
                  <span className="sx-label">{isCard ? "Fund the card from" : "Pay with"}</span>
                  <select
                    className="sx-field__input xr-select"
                    value={sourceId}
                    disabled={stage !== "review"}
                    onChange={(e) => {
                      setSourceId(e.target.value)
                      key.current = null
                    }}
                  >
                    {FUNDING_SOURCES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} · {s.detail}
                        {s.rail === COUNTRIES[HOME_COUNTRY].mainRail ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {quote ? (
              <div className="xr-breakdown">
                <div className="kv">
                  <span>{vendor.name.length > 26 ? "They get" : `${vendor.name} gets`}</span>
                  <span>{formatMoney(quote.vendorAmount, quote.vendorCurrency)}</span>
                </div>
                <div className="kv">
                  <span>Rate</span>
                  <span>{quote.rateLabel}</span>
                </div>
                {quote.needsFx ? (
                  <div className="kv">
                    <span>StableFX spread</span>
                    <span>{formatMoney(quote.fxUsd, "USD")}</span>
                  </div>
                ) : null}
                <div className="kv">
                  <span>
                    Rail fees ({RAILS[source.rail].label} in{source.rail === vendor.rail ? "" : `, ${RAILS[vendor.rail].label} out`})
                  </span>
                  <span>{formatMoney(quote.feesUsd, "USD")}</span>
                </div>
                <div className="kv kv--total">
                  <span>You pay</span>
                  <span>{formatMoney(quote.sourceAmount, quote.sourceCurrency)}</span>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed)" }}>
                {error}
              </p>
            ) : null}

            {stage === "review" ? (
              <button type="button" className="sx-btn sx-btn--primary" disabled={!quote} onClick={pay}>
                {isCard ? "Tap to pay" : "Pay"} {quote ? formatMoney(quote.sourceAmount, quote.sourceCurrency) : ""}
              </button>
            ) : null}
            {stage === "processing" && failedAt !== null ? (
              <button type="button" className="sx-btn sx-btn--secondary" onClick={() => setStage("review")}>
                Back
              </button>
            ) : null}
            {stage === "done" ? (
              <div className="filters">
                <button type="button" className="sx-btn sx-btn--primary" onClick={reset}>
                  Pay someone else
                </button>
                <Link href={liveLeg ? "/activity" : "/home"} className="sx-btn sx-btn--secondary">
                  {liveLeg ? "View activity" : "Back to Home"}
                </Link>
              </div>
            ) : null}
          </section>

          <aside className="tile s5" aria-label="Route">
            <div className="tile-head">
              <h2 className="tile-title">How the money moves</h2>
              {liveLeg ? <span className="sx-pill sx-pill--settled">Live Pix</span> : <span className="sx-pill sx-pill--simulated">Simulated</span>}
            </div>
            <div className="xr-strip" aria-hidden>
              <div>
                <span className="xr-rail xr-rail--a">{RAILS[source.rail].label}</span>
                <span className="body-s muted">You</span>
              </div>
              <span className="xr-chev">→</span>
              <div>
                <span className="xr-rail">{quote?.needsFx ? "StableFX" : "USDC"}</span>
                <span className="body-s muted">Sancus</span>
              </div>
              <span className="xr-chev">→</span>
              <div>
                <span className="xr-rail xr-rail--b">{RAILS[vendor.rail].label}</span>
                <span className="body-s muted">Vendor</span>
              </div>
            </div>
            {legs.length ? (
              <CrossRailRoute legs={legs} active={stage === "review" ? -1 : active} results={results} failedAt={failedAt} />
            ) : (
              <span className="body-s muted">Enter an amount to see the route.</span>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
