import Link from "next/link"
import { workspace } from "@/lib/sancus/demo-data"

const steps = [
  {
    href: "/receive",
    title: "Add money",
    help: "From a US bank, a Pix transfer or another USDC account.",
  },
  {
    href: "/pay",
    title: "Save someone you pay",
    help: "A supplier, contractor or employee, with how they like to be paid.",
  },
  {
    href: "/team",
    title: "Invite your team",
    help: "Set limits, then give people a card or local QR.",
  },
] as const

export default function HomeEmptyPage() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">
            Welcome, {workspace.actor.firstName}. Let&apos;s add some money.
          </h1>
        </div>
        <span className="body-s muted">Day one</span>
      </header>

      <div className="grid">
        <section className="tile s8" aria-labelledby="bal">
          <div className="tile-head">
            <span className="sx-label" id="bal">
              Available balance
            </span>
          </div>
          <div className="sx-balance">
            <span className="sx-balance__amount">
              $0.00 <small>USD</small>
            </span>
            <span className="sx-balance__meta">
              Your balance is held as USDC, 1:1 with US dollars.
            </span>
          </div>
          <div className="empty" style={{ minHeight: 110 }}>
            Your balance over time will show here once money lands.
          </div>
          <div className="tile-foot">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/receive" className="sx-btn sx-btn--primary">
                Add money
              </Link>
              <button type="button" className="sx-btn sx-btn--secondary" disabled>
                Pay someone
              </button>
            </div>
            <span className="body-s muted">Add money to start paying people.</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="needs">
          <div className="tile-head">
            <h2 className="tile-title" id="needs">
              Needs you
            </h2>
          </div>
          <div className="empty">
            Nothing needs you. Payments waiting for your approval will show up here.
          </div>
        </section>

        <section className="tile s8 r2" aria-labelledby="start">
          <div className="tile-head">
            <h2 className="tile-title" id="start">
              Get set up
            </h2>
            <span className="body-s muted">1 of 4 done</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="pick">
              <span className="sx-pill sx-pill--settled">Done</span>
              <span style={{ flex: 1 }} className="body-strong">
                Open your account
              </span>
            </div>
            {steps.map((s) => (
              <Link key={s.href} href={s.href} className="pick">
                <span className="radio" />
                <span style={{ flex: 1, display: "grid" }}>
                  <span className="body-strong">{s.title}</span>
                  <span className="body-s">{s.help}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="empty">Nothing here yet. Your first payment will show up here.</div>
        </section>

        <section className="tile s4" aria-labelledby="month">
          <div className="tile-head">
            <h2 className="tile-title" id="month">
              This month
            </h2>
            <span className="body-s muted">November</span>
          </div>
          <div className="kv">
            <span>Money in</span>
            <span>$0.00</span>
          </div>
          <div className="kv">
            <span>Money out</span>
            <span>$0.00</span>
          </div>
          <div className="kv">
            <span>Fees</span>
            <span>$0.00</span>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="spend">
          <div className="tile-head">
            <h2 className="tile-title" id="spend">
              Team spending
            </h2>
          </div>
          <div className="empty">
            No cards or QR yet.
            <Link href="/team/ana/methods/new" className="sx-btn sx-btn--secondary sx-btn--sm">
              Give someone a card
            </Link>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="bills">
          <div className="tile-head">
            <h2 className="tile-title" id="bills">
              Bills due soon
            </h2>
          </div>
          <div className="empty">
            Drop in a supplier&apos;s invoice and we&apos;ll get it ready to pay.
            <Link href="/invoices" className="sx-btn sx-btn--secondary sx-btn--sm">
              Add an invoice
            </Link>
          </div>
        </section>

        <section className="tile s4" aria-labelledby="agents">
          <div className="tile-head">
            <h2 className="tile-title" id="agents">
              Agents
            </h2>
            <span className="sx-pill sx-pill--simulated">Off</span>
          </div>
          <div className="empty">Let an agent handle small payments inside a budget you set.</div>
        </section>

        <section className="tile s4" aria-labelledby="ask">
          <div className="tile-head">
            <h2 className="tile-title" id="ask">
              Ask Sancus
            </h2>
          </div>
          <label>
            <span className="vh">Ask a question</span>
            <input className="sx-field__input" placeholder="How do I pay someone in Brazil?" />
          </label>
          <div className="tile-foot">
            <span className="body-s muted">Works once you have activity</span>
          </div>
        </section>
      </div>
    </div>
  )
}
