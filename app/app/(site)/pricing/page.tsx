import type { Metadata } from "next"
import { QuoteCalculator } from "@/components/sancus-ui/quote-calculator"
import { SITE_RAILS } from "@/lib/sancus/rails"

export const metadata: Metadata = {
  title: "Sancus · Rails and fees",
}

export default function PricingPage() {
  return (
    <>
      <header className="phead phead--wide">
        <div className="wrap g12">
          <div className="phead-copy">
            <h1 className="sx-h display-l">
              One balance. Every <em>rail</em>.
            </h1>
            <p className="body-l">
              What each payment costs and when it arrives. Review shows the rate and fee again before you confirm.
            </p>
          </div>
          <div className="phead-art">
            <QuoteCalculator />
          </div>
        </div>
      </header>
      <main>
        <section className="sec" aria-labelledby="rails-h">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2 id="rails-h" className="sx-h heading-2">
                  Where you can pay
                </h2>
              </div>
              <p className="body muted">The fee is per payment. Rates are set at review and locked for 60 seconds.</p>
            </div>
            <div className="tbl-box">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Rail</th>
                    <th scope="col">Use it for</th>
                    <th scope="col">Arrives</th>
                    <th scope="col" className="r">
                      Fee
                    </th>
                    <th scope="col" className="r">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SITE_RAILS.map((r) => (
                    <tr key={r.name}>
                      <td>
                        <span className="sx-rail">{r.name}</span>
                      </td>
                      <td>{r.use}</td>
                      <td>{r.speed}</td>
                      <td className="r mono">{r.fee}</td>
                      <td className="r">
                        {r.simulated ? (
                          <span className="sx-pill sx-pill--simulated">Simulated</span>
                        ) : (
                          <span className="sx-pill sx-pill--settled">Live on testnet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Fees and rates are sandbox values. Adding money and holding a balance are free.</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
