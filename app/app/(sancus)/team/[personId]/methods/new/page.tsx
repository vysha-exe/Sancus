"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { QrGlyph } from "@/components/sancus-ui/qr-glyph"
import { getPerson, people } from "@/lib/sancus/demo-data"

type Kind = "card" | "qr"
type Country = "Brazil" | "Indonesia" | "Thailand"

const countryInfo: Record<
  Country,
  { network: string; code: string; rate: number; defaultQr: number; defaultCard: number; help: string }
> = {
  Brazil: {
    network: "Pix",
    code: "BRL",
    rate: 5.4123,
    defaultQr: 800,
    defaultCard: 2700,
    help: "Pix is the only QR network in Brazil.",
  },
  Indonesia: {
    network: "QRIS",
    code: "IDR",
    rate: 16300,
    defaultQr: 3200000,
    defaultCard: 3200000,
    help: "QRIS is the only QR network in Indonesia.",
  },
  Thailand: {
    network: "PromptPay",
    code: "THB",
    rate: 34.5,
    defaultQr: 8500,
    defaultCard: 8500,
    help: "PromptPay is the only QR network in Thailand.",
  },
}

function formatLocal(code: string, n: number): string {
  if (code === "BRL") return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (code === "IDR") return `Rp ${Math.round(n).toLocaleString("id-ID")}`
  return `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatShort(code: string, n: number): string {
  if (code === "BRL") return `R$ ${Math.round(n).toLocaleString("pt-BR")}`
  if (code === "IDR") return `Rp ${Math.round(n).toLocaleString("id-ID")}`
  return `฿${Math.round(n).toLocaleString("en-US")}`
}

function parseNumber(raw: string, code: string): number {
  // Brazilian and Indonesian formats use "." for thousands and "," for decimals.
  const cleaned =
    code === "THB" ? raw.replace(/[^0-9.]/g, "") : raw.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "")
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

const countryFor = (c: string): Country =>
  c === "Indonesia" || c === "Thailand" ? c : "Brazil"

export default function AssignMethodPage() {
  const params = useParams<{ personId: string }>()
  const initialId = params?.personId ?? "ana"
  const initialPerson = getPerson(initialId)

  const spenders = people.filter((p) => p.role === "Employee" || p.role === "Finance")
  const [personId, setPersonId] = useState(initialPerson ? initialPerson.id : "ana")
  const person = getPerson(personId) ?? spenders[0]
  const first = person.name.split(" ")[0]

  const [kind, setKind] = useState<Kind>("qr")
  const [country, setCountry] = useState<Country>(countryFor(initialPerson?.country ?? "Brazil"))
  const info = countryInfo[country]
  const [name, setName] = useState("Market runs")
  const [limitRaw, setLimitRaw] = useState(formatLocal(info.code, info.defaultQr))
  const [hold, setHold] = useState(false)

  if (!initialPerson) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="sx-h heading-2">We couldn&apos;t find that person</h1>
            <p className="body-s muted" style={{ margin: 0 }}>
              Pick someone from your team to give them a card or QR.
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
    setLimitRaw(formatLocal(info.code, next === "card" ? info.defaultCard : info.defaultQr))
  }

  function changePerson(id: string) {
    const p = getPerson(id)
    setPersonId(id)
    if (p) changeCountry(countryFor(p.country))
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="body-s muted">
            <Link href="/team">Team</Link> / <Link href={`/team/${person.id}`}>{person.name}</Link> / Add a
            card or QR
          </nav>
          <h1 className="sx-h heading-2">Give {first} a way to spend</h1>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-label="Details">
          <label className="sx-field">
            <span className="sx-label">Who</span>
            <select
              className="sx-field__input"
              value={person.id}
              onChange={(e) => changePerson(e.target.value)}
            >
              {spenders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.role} · {p.country}
                </option>
              ))}
            </select>
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
                  <span className="sx-rail">QR</span> Local QR
                </span>
                <span className="body-s muted">Scan merchant QR codes in one country.</span>
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
                <option>Brazil</option>
                <option>Indonesia</option>
                <option>Thailand</option>
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
            <Link href={`/team/${person.id}`} className="sx-btn sx-btn--primary">
              Give {first} {kind === "card" ? "a card" : `${info.network} QR`}
            </Link>
          </div>
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
              <span className="sx-rail">{kind === "card" ? "Card" : `${info.network} QR`}</span>
              <span className="sx-pill sx-pill--simulated">Simulated</span>
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
                : `${first} scans any ${info.network} QR in ${country} from the Sancus app.`}
            </li>
            <li>Each payment converts from dollars at the live rate, and the receipt shows it.</li>
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
              Card and QR limits count in each person&apos;s currency, so they match the till. Your
              balance is in dollars, so held amounts move a little with the rate. We re-price them
              every morning. Per-payment approval limits stay in USD, set by your approval rule.
            </span>
          </div>
        </aside>
      </div>
    </div>
  )
}
