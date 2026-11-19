"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { FIXED_USD_RATES } from "@/lib/sancus/fixed-rates"

type Kind = "card" | "qr"
type Country =
  | "United States"
  | "Canada"
  | "Brazil"
  | "United Kingdom"
  | "Ireland"
  | "Germany"
  | "France"
  | "Netherlands"
  | "Spain"
  | "Italy"
  | "Sweden"
  | "Switzerland"
  | "Singapore"
  | "Hong Kong"
  | "Japan"
  | "Australia"
  | "Indonesia"
  | "Thailand"

type CountryInfo = {
  network: string
  code: string
  rate: number
  defaultQr: number
  defaultCard: number
  help: string
}

const euro = (help: string): CountryInfo => ({
  network: "Card",
  code: "EUR",
  rate: FIXED_USD_RATES.EUR,
  defaultQr: 460,
  defaultCard: 460,
  help,
})

const countryInfo: Record<Country, CountryInfo> = {
  "United States": { network: "Card", code: "USD", rate: FIXED_USD_RATES.USD, defaultQr: 500, defaultCard: 500, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Canada: { network: "Card", code: "CAD", rate: FIXED_USD_RATES.CAD, defaultQr: 680, defaultCard: 680, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Brazil: { network: "Pix", code: "BRL", rate: FIXED_USD_RATES.BRL, defaultQr: 800, defaultCard: 2700, help: "Pix is the only QR network in Brazil." },
  "United Kingdom": { network: "Card", code: "GBP", rate: FIXED_USD_RATES.GBP, defaultQr: 400, defaultCard: 400, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Ireland: euro("Cards are accepted anywhere Visa or Mastercard is."),
  Germany: euro("Cards are accepted anywhere Visa or Mastercard is."),
  France: euro("Cards are accepted anywhere Visa or Mastercard is."),
  Netherlands: euro("Cards are accepted anywhere Visa or Mastercard is."),
  Spain: euro("Cards are accepted anywhere Visa or Mastercard is."),
  Italy: euro("Cards are accepted anywhere Visa or Mastercard is."),
  Sweden: { network: "Card", code: "SEK", rate: FIXED_USD_RATES.SEK, defaultQr: 5200, defaultCard: 5200, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Switzerland: { network: "Card", code: "CHF", rate: FIXED_USD_RATES.CHF, defaultQr: 450, defaultCard: 450, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Singapore: { network: "Card", code: "SGD", rate: FIXED_USD_RATES.SGD, defaultQr: 670, defaultCard: 670, help: "Cards are accepted anywhere Visa or Mastercard is." },
  "Hong Kong": { network: "Card", code: "HKD", rate: FIXED_USD_RATES.HKD, defaultQr: 3900, defaultCard: 3900, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Japan: { network: "Card", code: "JPY", rate: FIXED_USD_RATES.JPY, defaultQr: 75000, defaultCard: 75000, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Australia: { network: "Card", code: "AUD", rate: FIXED_USD_RATES.AUD, defaultQr: 760, defaultCard: 760, help: "Cards are accepted anywhere Visa or Mastercard is." },
  Indonesia: { network: "QRIS", code: "IDR", rate: FIXED_USD_RATES.IDR, defaultQr: 3200000, defaultCard: 3200000, help: "QRIS is the only QR network in Indonesia." },
  Thailand: { network: "PromptPay", code: "THB", rate: FIXED_USD_RATES.THB, defaultQr: 8500, defaultCard: 8500, help: "PromptPay is the only QR network in Thailand." },
}

const cardRegions: { label: string; countries: Country[] }[] = [
  { label: "Americas", countries: ["United States", "Canada", "Brazil"] },
  { label: "Europe", countries: ["United Kingdom", "Ireland", "Germany", "France", "Netherlands", "Spain", "Italy", "Sweden", "Switzerland"] },
  { label: "Asia Pacific", countries: ["Singapore", "Hong Kong", "Japan", "Australia", "Indonesia", "Thailand"] },
]

function formatLocal(code: string, n: number): string {
  if (code === "BRL") return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (code === "IDR") return `Rp ${Math.round(n).toLocaleString("id-ID")}`
  if (code === "THB") return `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const digits = code === "JPY" ? 0 : 2
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
}

function formatShort(code: string, n: number): string {
  if (code === "BRL") return `R$ ${Math.round(n).toLocaleString("pt-BR")}`
  if (code === "IDR") return `Rp ${Math.round(n).toLocaleString("id-ID")}`
  if (code === "THB") return `฿${Math.round(n).toLocaleString("en-US")}`
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(n)
}

function parseNumber(raw: string, code: string): number {
  // Brazilian and Indonesian formats use "." for thousands and "," for decimals.
  const dotDecimal = code !== "BRL" && code !== "IDR"
  const cleaned = dotDecimal
    ? raw.replace(/[^0-9.]/g, "")
    : raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const countryForCode = (code: string | undefined): Country => {
  if (code === "ID") return "Indonesia"
  if (code === "TH") return "Thailand"
  if (code === "BR") return "Brazil"
  if (code === "US") return "United States"
  if (code === "SG") return "Singapore"
  return "Brazil"
}

export default function AssignMethodPage() {
  const params = useParams<{ personId: string }>()
  const router = useRouter()
  const initialId = params?.personId ?? ""
  const validInitialId = /^[0-9a-f-]{36}$/i.test(initialId)
  const [liveName, setLiveName] = useState<string | null>(null)
  const [liveUserId, setLiveUserId] = useState<string | null>(null)
  const [liveOk, setLiveOk] = useState(false)
  const [liveLoaded, setLiveLoaded] = useState(!validInitialId)
  const [personId] = useState(initialId)

  useEffect(() => {
    if (!validInitialId) return
    void fetch(`/api/sancus/companies/members/${initialId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return
        const body = await res.json()
        setLiveName(body.member?.email ?? body.member?.userId ?? "Teammate")
        setLiveUserId(body.member?.userId ?? null)
        setLiveOk(true)
        changeCountry(countryForCode(body.company?.country))
      })
      .catch(() => undefined)
      .finally(() => setLiveLoaded(true))
  // The membership id uniquely selects the database employee for this page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId, validInitialId])
  const person = {
    id: personId,
    name: liveName ?? "Teammate",
    role: "Employee",
    country: "Brazil",
    initials: "T",
  }
  const first = person.name.split(" ")[0]?.split("@")[0] ?? "them"

  const [kind, setKind] = useState<Kind>("qr")
  const [country, setCountry] = useState<Country>("Brazil")
  const info = countryInfo[country]
  const [name, setName] = useState("Market runs")
  const [limitRaw, setLimitRaw] = useState(formatLocal(info.code, info.defaultQr))
  const [hold, setHold] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  if (liveLoaded && !liveOk) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="sx-h heading-2">We couldn&apos;t find that person</h1>
            <p className="body-s muted" style={{ margin: 0 }}>
              Pick someone from your team to give them a card or Pix access.
            </p>
          </div>
        </header>
        <div>
          <Link href="/team" className="sx-btn sx-btn--primary">
            Back to Team
          </Link>
        </div>
      </div>
    )
  }

  const limit = parseNumber(limitRaw, info.code)
  const usd = limit / info.rate
  const usdLabel = money.format(usd)
  const holds = kind === "card" || hold
  function changeCountry(next: Country) {
    const nextInfo = countryInfo[next]
    setCountry(next)
    setLimitRaw(formatLocal(nextInfo.code, kind === "card" ? nextInfo.defaultCard : nextInfo.defaultQr))
  }

  function changeKind(next: Kind) {
    setKind(next)
    setName(next === "card" ? "Office and supplies" : "Market runs")
    const nextCountry = next === "qr" && !["Brazil", "Indonesia", "Thailand"].includes(country)
      ? "Brazil"
      : country
    const nextInfo = countryInfo[nextCountry]
    setCountry(nextCountry)
    setLimitRaw(formatLocal(nextInfo.code, next === "card" ? nextInfo.defaultCard : nextInfo.defaultQr))
  }

  async function issueAccess() {
    if (!liveUserId) {
      setIssueError("They need to accept the invite and create their employee login before you can issue spending access.")
      return
    }
    setIssuing(true)
    setIssueError(null)
    const methodType = info.network === "QRIS" ? "QRIS" : info.network === "PromptPay" ? "PROMPTPAY" : "PIX"
    try {
      const response = await fetch("/api/sancus/spending-methods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: liveUserId,
          employeeName: person.name,
          label: name,
          methodType,
          currency: info.code,
          monthlyLimit: limit,
          ...(methodType === "PIX" ? { monthlyLimitBrl: limit } : {}),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not issue spending access")
      router.push("/spending")
    } catch (caught) {
      setIssueError(caught instanceof Error ? caught.message : "Could not issue spending access")
    } finally {
      setIssuing(false)
    }
  }

  async function issueCard() {
    if (!liveUserId) {
      setIssueError("They need to accept the invite and create their employee login before you can issue a card.")
      return
    }
    setIssuing(true)
    setIssueError(null)
    try {
      const response = await fetch("/api/sancus/cards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          employeeId: liveUserId,
          employeeName: person.name,
          label: name,
          country,
          currency: info.code,
          monthlyLimit: limit,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Could not issue card")
      router.push("/spending")
    } catch (caught) {
      setIssueError(caught instanceof Error ? caught.message : "Could not issue card")
    } finally {
      setIssuing(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="body-s muted">
            <Link href="/team">Team</Link> / <Link href={`/team/${person.id}`}>{person.name}</Link> / Add a
            card or Pix access
          </nav>
          <h1 className="sx-h heading-2">Give {first} a way to spend</h1>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-label="Details">
          <label className="sx-field">
            <span className="sx-label">Who</span>
            <input className="sx-field__input" value={person.name} readOnly />
          </label>

          <div style={{ display: "grid", gap: 8 }} role="radiogroup" aria-label="What kind">
            <span className="sx-label">What kind</span>
            <div className="opt-grid">
              <button
                type="button"
                role="radio"
                aria-checked={kind === "card"}
                className={`opt${kind === "card" ? " opt--on" : ""}`}
                onClick={() => changeKind("card")}
                style={{ textAlign: "left", font: "inherit", color: "inherit" }}
              >
                <span className="body-strong">
                  <span className="sx-rail">Card</span> Virtual card
                </span>
                <span className="body-s muted">Online or in shops, anywhere cards work.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={kind === "qr"}
                className={`opt${kind === "qr" ? " opt--on" : ""}`}
                onClick={() => changeKind("qr")}
                style={{ textAlign: "left", font: "inherit", color: "inherit" }}
              >
                <span className="body-strong">
                  <span className="sx-rail">Pix</span> Pix access
                </span>
                <span className="body-s muted">Pix, QRIS or PromptPay for local merchants.</span>
              </button>
            </div>
          </div>

          <div className="grid" style={{ gap: 12 }}>
            <label className="sx-field s6">
              <span className="sx-label">Country</span>
              <select
                className="sx-field__input"
                value={country}
                onChange={(e) => changeCountry(e.target.value as Country)}
              >
                {kind === "card"
                  ? cardRegions.map((region) => (
                      <optgroup key={region.label} label={region.label}>
                        {region.countries.map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </optgroup>
                    ))
                  : (
                    <>
                      <option>Brazil</option>
                      <option>Indonesia</option>
                      <option>Thailand</option>
                    </>
                  )}
              </select>
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Network</span>
              <select
                className="sx-field__input"
                value={kind === "card" ? "card" : info.network}
                onChange={() => {}}
                disabled={kind === "card"}
              >
                {kind === "card" ? <option value="card">Card network</option> : <option>{info.network}</option>}
              </select>
              <span className="sx-field__help">
                {kind === "card" ? "Cards work anywhere cards are accepted." : info.help}
              </span>
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Name</span>
              <input className="sx-field__input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="sx-field s6">
              <span className="sx-label">Monthly limit · {info.code}</span>
              <input
                className="sx-field__input"
                value={limitRaw}
                onChange={(e) => setLimitRaw(e.target.value)}
                style={{ fontFamily: "var(--font-mono)" }}
              />
              <span className="sx-field__help">
                About {usdLabel} today. Resets on the 1st. {first} sees the same number at the till.
              </span>
            </label>
          </div>

          <label className="pick" style={{ cursor: kind === "card" ? "default" : "pointer" }}>
            <input
              type="checkbox"
              checked={holds}
              disabled={kind === "card"}
              onChange={(e) => setHold(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--accent)" }}
            />
            <span style={{ display: "grid" }}>
              <span className="body-strong">Hold the full limit in your balance</span>
              <span className="body-s">
                {first} can always spend it, but about {usdLabel} less is available to you. We re-price
                holds each morning as the rate moves. Cards always hold.
              </span>
            </span>
          </label>

          <div className="tile-foot">
            <Link href={`/team/${person.id}`} className="sx-btn sx-btn--secondary">
              Cancel
            </Link>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              onClick={() => void (kind === "card" ? issueCard() : issueAccess())}
              disabled={issuing || limit <= 0 || !name.trim()}
            >
              {issuing
                ? "Issuing…"
                : kind === "card"
                  ? `Give ${first} a card`
                  : `Give ${first} ${info.network} access`}
            </button>
          </div>
          {issueError ? <span className="body-s" role="alert" style={{ color: "var(--danger, #c0392b)" }}>{issueError}</span> : null}
        </section>

        <aside className="tile s5" aria-labelledby="pv">
          <span className="sx-label" id="pv">
            What {first} gets
          </span>
          <div
            style={{
              aspectRatio: 1.586,
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface-000)",
              padding: 20,
              display: "grid",
              gridTemplateRows: "auto 1fr auto",
            }}
          >
            <span style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="sx-rail">{kind === "card" ? "Card" : "Pix access"}</span>
              <span className="sx-pill">{kind === "card" ? "Marqeta sandbox" : "PayZu sandbox"}</span>
            </span>
            {kind === "card" ? (
              <span className="data" style={{ alignSelf: "center", justifySelf: "center" }}>
                •••• ••••
              </span>
            ) : (
              <QrGlyph />
            )}
            <span className="data">
              {person.name.toUpperCase()} · {country.toUpperCase()} · {formatShort(info.code, limit)} / MONTH
            </span>
          </div>
          <ul
            className="body-s"
            style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}
          >
            <li>
              {kind === "card"
                ? `${first} gets a virtual card to use online or in shops.`
                : `${first} pays merchants with ${info.network} in ${country} from the Sancus app.`}
            </li>
            <li>Each payment converts from dollars at the fixed demo rate, and the receipt shows it.</li>
            <li>
              Over {formatLocal(info.code, limit)} a month, {first} has to ask you.
            </li>
            <li>You can pause it at any time. It stops working straight away.</li>
          </ul>
          <div
            className="tile-foot"
            style={{ display: "grid", gap: 4, justifyContent: "stretch" }}
          >
            <span className="sx-label">Limits are in local currency</span>
            <span className="body-s muted">
              Card and Pix limits count in each person&apos;s currency, so they match the till. Your
              balance is in dollars, so held amounts move a little with the rate. We re-price them
              every morning. Per-payment approval limits stay in USD, set by your approval rule.
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}
