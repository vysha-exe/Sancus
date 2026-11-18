import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sancus · How your money is kept",
}

const HOPS: { title: string; data: string }[] = [
  { title: "Rules checked", data: "Treasury contract · within limits" },
  { title: "Rate locked", data: "1 USD = 5.4123 BRL · 60 s" },
  { title: "Funded from balance", data: "$100.80 · USDC" },
  { title: "Paid out by Pix", data: "Pix key ju•••@gmail.com" },
  { title: "Received by Juliana", data: "R$ 541,23" },
]

const CAPABILITIES: { feature: string; how: string }[] = [
  { feature: "Dollar balance", how: "USDC in Circle wallets and Gateway on Arc" },
  { feature: "Pay a USDC account", how: "Onchain USDC with a transaction reference" },
  { feature: "Limits, holds and approvals", how: "Treasury contract and app policy" },
  { feature: "Paid endpoints for agents", how: "Other agents pay per call; revenue lands in the balance" },
  { feature: "QRIS and PromptPay", how: "Local collection rails across Asia" },
  { feature: "Team cards", how: "Virtual cards with limits and holds" },
  { feature: "Pix, SPEI, SEPA, ACH and wire", how: "Payouts on the rails your counterparties already use" },
  { feature: "Rates", how: "Shown and locked before you confirm" },
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
            <p className="body-l">Where your balance lives, and what checks every payment.</p>
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
                    <span className="sx-pill sx-pill--settled">Settled</span>
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
                  Every dollar in your balance is a USDC dollar, issued by Circle and held in a treasury contract on Arc.
                  Circle Gateway keeps it one balance across chains, and Gas Station pays network fees, so you never hold
                  a gas token.
                </p>
                <div className="chips">
                  <span className="sx-rail">USDC</span>
                  <span className="sx-rail">Arc</span>
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
                A double-entry ledger records every payment, fee and hold. Each receipt shows every hop with its status,
                and USDC payments show their transaction reference.
              </p>
            </div>
          </div>
        </section>

        <section id="real" className="sec white rule-top" aria-labelledby="real-h">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2 id="real-h" className="sx-h heading-2">
                  Built into the <em>account</em>
                </h2>
              </div>
              <p className="body muted">What your Sancus balance can do from day one.</p>
            </div>
            <div className="tbl-box">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">How it runs</th>
                  </tr>
                </thead>
                <tbody>
                  {CAPABILITIES.map((r) => (
                    <tr key={r.feature}>
                      <td>{r.feature}</td>
                      <td>{r.how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
