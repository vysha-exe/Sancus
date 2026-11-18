import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sancus · How your money is kept",
}

const HOPS: { title: string; data: string; pill: "settled" | "simulated" }[] = [
  { title: "Rules checked", data: "Treasury contract · within limits", pill: "settled" },
  { title: "Rate locked", data: "1 USD = 5.4123 BRL · 60 s", pill: "settled" },
  { title: "Funded from balance", data: "$100.80 · USDC on Arc", pill: "settled" },
  { title: "Paid out by Pix", data: "Pix key ju•••@gmail.com", pill: "simulated" },
  { title: "Received by Juliana", data: "R$ 541,23", pill: "settled" },
]

const REAL: { feature: string; how: string; pill: "settled" | "pending" | "simulated"; status: string }[] = [
  { feature: "Dollar balance", how: "USDC in Circle wallets and Gateway, on Arc", pill: "settled", status: "Testnet" },
  { feature: "Pay a USDC account", how: "Real USDC transfers with a transaction reference", pill: "settled", status: "Testnet" },
  { feature: "Limits, holds and approvals", how: "Treasury contract and app", pill: "settled", status: "Testnet" },
  {
    feature: "Paid endpoints for agents",
    how: "Other agents pay per call; revenue lands in the balance",
    pill: "settled",
    status: "Testnet",
  },
  { feature: "QRIS and PromptPay", how: "Provider sandboxes", pill: "pending", status: "Sandbox" },
  { feature: "Team cards", how: "Card issuer sandbox", pill: "pending", status: "Sandbox" },
  { feature: "Pix, SPEI, SEPA, ACH and wire", how: "Simulated payouts", pill: "simulated", status: "Simulated" },
  { feature: "Rates", how: "Sandbox rates, not live market prices", pill: "simulated", status: "Simulated" },
]

export default function SecurityPage() {
  return (
    <>
      <header className="phead phead--wide">
        <div className="wrap g12">
          <div className="phead-copy">
            <h1 className="sx-h display-l">
              How your money is <em>kept</em>.
            </h1>
            <p className="body-l">
              Where your balance lives, what checks every payment, and what&apos;s real in this prototype.
            </p>
          </div>
          <div className="phead-art">
            <article className="receipt" aria-label="Example receipt">
              <div className="receipt-top">
                <div className="receipt-who">
                  <span className="av">JC</span>
                  <span>
                    <span className="body-strong">Juliana Costa</span>
                    <span className="body-s muted">
                      Today, 9:41 · <span className="sx-rail">Pix</span>
                    </span>
                  </span>
                </div>
                <span className="receipt-amt">R$ 541,23</span>
              </div>
              <ol className="hops">
                {HOPS.map((h) => (
                  <li key={h.title}>
                    <span className="hop-dot" aria-hidden="true" />
                    <span className="hop-txt">
                      <b>{h.title}</b>
                      <span className="data">{h.data}</span>
                    </span>
                    <span className={`sx-pill sx-pill--${h.pill}`}>
                      {h.pill === "settled" ? "Settled" : "Simulated"}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="receipt-foot">
                <span className="sx-label muted">Receipt</span>
                <span className="data muted">Every hop is in the ledger</span>
              </div>
            </article>
          </div>
        </div>
      </header>
      <main>
        <section className="sec" aria-label="How Sancus keeps your money">
          <div className="wrap layers">
            <div className="layer">
              <span className="n">01</span>
              <h2 className="sx-h">Held as USDC, one for one</h2>
              <div>
                <p className="body">
                  Every dollar in your balance is a USDC dollar, issued by Circle and held in a treasury contract on Arc
                  testnet. Circle Gateway keeps it one balance across chains, and Gas Station pays network fees, so you
                  never hold a gas token.
                </p>
                <div className="chips">
                  <span className="sx-rail">USDC</span>
                  <span className="sx-rail">Arc testnet</span>
                  <span className="sx-rail">Circle Gateway</span>
                </div>
              </div>
            </div>
            <div className="layer">
              <span className="n">02</span>
              <h2 className="sx-h">Rules live in the contract</h2>
              <p className="body">
                Card and QR limits, holds and approval rules are enforced by the treasury contract, not only by the app.
                A payment that breaks a rule can&apos;t settle.
              </p>
            </div>
            <div className="layer">
              <span className="n">03</span>
              <h2 className="sx-h">A second person signs</h2>
              <p className="body">
                Payments over your limit, or to someone new, wait for an approver, who signs with a passkey. Nobody
                approves their own request, and requests expire after 7 days.
              </p>
            </div>
            <div className="layer">
              <span className="n">04</span>
              <h2 className="sx-h">No surprise rates</h2>
              <p className="body">
                The rate is locked for 60 seconds at review. When the lock runs out, the button becomes Refresh rate. We
                never charge on an expired quote.
              </p>
            </div>
            <div className="layer">
              <span className="n">05</span>
              <h2 className="sx-h">One ledger, every hop</h2>
              <p className="body">
                A double-entry ledger records every payment, fee and hold, onchain or simulated. Each receipt shows every
                hop with its status, and USDC payments show their transaction reference.
              </p>
            </div>
          </div>
        </section>

        <section id="real" className="sec white rule-top" aria-labelledby="real-h">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2 id="real-h" className="sx-h heading-2">
                  What&apos;s real <em>today</em>
                </h2>
              </div>
              <p className="body muted">
                Sancus is a hackathon prototype. Here&apos;s exactly what runs for real and what&apos;s simulated.
              </p>
            </div>
            <div className="tbl-box">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">How it runs</th>
                    <th scope="col" className="r">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {REAL.map((r) => (
                    <tr key={r.feature}>
                      <td>{r.feature}</td>
                      <td>{r.how}</td>
                      <td className="r">
                        <span className={`sx-pill sx-pill--${r.pill}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="sec rule-top" aria-labelledby="not-h">
          <div className="wrap g12">
            <h2 id="not-h" className="c5 sx-h heading-2">
              What Sancus isn&apos;t
            </h2>
            <p className="c7 body-l muted">
              Sancus isn&apos;t a bank and doesn&apos;t hold customer funds. Real banking, cards and cross-border payouts
              need licensed partners and regulatory approval, and we&apos;d work with them before anyone&apos;s real money
              moved.
            </p>
          </div>
        </section>
      </main>
    </>
  )
}
