import type { Metadata } from "next"
import Link from "next/link"
import { DemoLink } from "@/components/sancus-ui/demo-link"
import { Temple } from "@/components/sancus-ui/temple"
import { Ticks, VirtualCard } from "@/components/sancus-ui/virtual-card"

export const metadata: Metadata = {
  title: "Sancus · Money that keeps its word",
}

const NBSP = "\u00a0"

export default function SiteLandingPage() {
  return (
    <>
      <header className="hero">
        <div className="wrap g12">
          <div className="hero-copy">
            <h1 className="sx-h display-xl">
              Money that keeps its <em>word</em>.
            </h1>
            <p className="body-l">
              Hold dollars in one balance. Pay suppliers, contractors and your team abroad in their own currency, on
              the rails they already use.
            </p>
            <div className="hero-ctas">
              <Link className="sx-btn sx-btn--primary" href="/sign-up">
                Open your account
              </Link>
              <DemoLink className="sx-btn sx-btn--secondary">Try the demo</DemoLink>
            </div>
            <nav aria-label="Sign in" style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <span className="sx-label">Sign in as</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Link className="chip" href="/sign-in?as=admin">
                  Business admin
                </Link>
                <Link className="chip" href="/sign-in?as=branch">
                  Branch
                </Link>
                <Link className="chip" href="/sign-in?as=employee">
                  Employee
                </Link>
                <Link className="chip" href="/sign-in?as=individual">
                  Individual
                </Link>
              </div>
            </nav>
          </div>
          <div className="hero-art">
            <Temple />
          </div>
        </div>
      </header>
      <main>
        <section className="sec" aria-label="Sancus in numbers">
          <div className="wrap">
            <div className="proof">
              <div>
                <span className="amount-xl">9</span>
                <p className="body-s">Ways to pay from one dollar balance, from Pix to PromptPay to team cards.</p>
              </div>
              <div>
                <span className="amount-xl">
                  60<small> s</small>
                </span>
                <p className="body-s">Your rate is locked at review. We never charge on an expired quote.</p>
              </div>
              <div>
                <span className="amount-xl">1:1</span>
                <p className="body-s">Every dollar in your balance is held as a USDC dollar.</p>
              </div>
              <div>
                <span className="amount-xl">$0.00</span>
                <p className="body-s">
                  To pay a business with a USDC account. Every other fee shows before you confirm.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" aria-labelledby="explain">
          <div className="wrap g12 explain">
            <h2 id="explain" className="sx-h heading-1">
              Hold dollars. Pay in <em>theirs</em>.
            </h2>
            <p className="body-l">
              Sancus is one US dollar account for businesses that buy and sell abroad. Add money once, then pay anyone
              in their local currency. You see the rate, the fee and what they get before every payment.
            </p>
          </div>
        </section>

        <section id="how" className="sec white rule-top" aria-labelledby="how-h">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2 id="how-h" className="sx-h heading-2">
                  Five stops, one receipt.
                </h2>
              </div>
              <p className="body muted">
                Juliana is a contractor in São Paulo. Here&apos;s her $100.00 invoice, start to finish.
              </p>
            </div>
            <ol className="route">
              <li className="route-line" aria-hidden="true" />
              <li className="stop">
                <span className="stop-dot">01</span>
                <span className="sx-label">You</span>
                <h3>Top up</h3>
                <p>Add dollars by ACH, wire or USDC.</p>
                <span className="stop-data">+$10,000.00</span>
              </li>
              <li className="stop">
                <span className="stop-dot">02</span>
                <span className="sx-label">Your balance</span>
                <h3>Hold</h3>
                <p>Your balance is held as USDC, one for one.</p>
                <span className="stop-data">$10,000.00 USDC</span>
              </li>
              <li className="stop">
                <span className="stop-dot">03</span>
                <span className="sx-label">Sancus</span>
                <h3>Convert</h3>
                <p>We quote the rate and lock it for 60 seconds.</p>
                <span className="stop-data">1 USD = 5.4123 BRL</span>
              </li>
              <li className="stop">
                <span className="stop-dot">04</span>
                <span className="sx-label">Local rail</span>
                <h3>Pay out</h3>
                <p>Sent on the rail she already uses.</p>
                <span className="stop-data">
                  <span className="sx-rail">Pix</span>
                  {NBSP}
                  {NBSP}fee $0.80
                </span>
              </li>
              <li className="stop">
                <span className="stop-dot stop-dot--end">05</span>
                <span className="sx-label">Juliana</span>
                <h3>Received</h3>
                <p>In her bank in seconds, in reais.</p>
                <span className="stop-data">R$ 541,23</span>
              </li>
            </ol>
          </div>
        </section>

        <section className="sec rule-top" aria-labelledby="pay-h">
          <div className="wrap g12 feature">
            <div className="c5 feature-copy">
              <h2 id="pay-h" className="sx-h heading-2">
                Pay anyone abroad in their own <em>currency</em>.
              </h2>
              <p className="body-l">Pick who, enter the amount in dollars or theirs, and we pick the rail.</p>
              <Ticks
                items={[
                  "Rate, fee and what they get, before you confirm",
                  "Rate locked for 60 seconds at review",
                  "A receipt for every hop, from your balance to their bank",
                ]}
              />
            </div>
            <div className="c7">
              <div className="stage">
                <svg
                  className="stage-lines"
                  viewBox="0 0 600 460"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                >
                  <g fill="none" stroke="currentColor" strokeWidth="1.2">
                    <path d="M-20 400 Q 160 120 620 90" />
                    <path d="M-20 430 Q 260 220 620 210" />
                    <path d="M-20 360 Q 100 40 420 -20" />
                  </g>
                </svg>
                <div className="mock" aria-hidden="true">
                  <div className="mock-head">
                    <span className="body-strong">Review payment</span>
                    <span className="sx-quote__lock">Locked · 0:42</span>
                  </div>
                  <div className="who">
                    <span className="av">JC</span>
                    <span style={{ display: "grid", minWidth: 0 }}>
                      <span className="body-strong">Juliana Costa</span>
                      <span className="body-s muted">Pix key ju•••@gmail.com</span>
                    </span>
                  </div>
                  <div className="sx-quote">
                    <dl>
                      <dt>You pay</dt>
                      <dd>$100.00</dd>
                      <dt>Fee</dt>
                      <dd>$0.80</dd>
                      <dt>Rate</dt>
                      <dd>1 USD = 5.4123 BRL</dd>
                      <dt>Rail</dt>
                      <dd>
                        <span className="sx-rail">Pix</span>
                      </dd>
                      <dt>Arrives</dt>
                      <dd>In seconds</dd>
                    </dl>
                    <div className="sx-quote__receive">
                      <span className="body-s muted">Juliana gets</span>
                      <b>R$ 541,23</b>
                    </div>
                  </div>
                  <span className="fake-btn">Pay R$ 541,23</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sec white rule-top" aria-labelledby="spend-h">
          <div className="wrap g12 feature">
            <div className="c7">
              <div className="stage" style={{ gap: 24, alignContent: "center" }}>
                <svg
                  className="stage-lines"
                  viewBox="0 0 600 460"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                >
                  <g fill="none" stroke="currentColor" strokeWidth="1">
                    <circle cx="300" cy="150" r="120" />
                    <circle cx="300" cy="150" r="190" />
                    <circle cx="300" cy="150" r="260" />
                  </g>
                </svg>
                <VirtualCard
                  mark
                  limit="R$ 2.700"
                  name="ANA SOUZA"
                  num="•••• 4021"
                  ariaLabel="Ana Souza's virtual card ending 4021, limit 2,700 reais"
                />
                <div className="mock" style={{ maxWidth: 420 }} aria-label="Team limits this month">
                  <div className="arow">
                    <b>Ana · card 4021</b>
                    <span className="amt">R$ 541 of R$ 2.700</span>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <i style={{ width: "20%" }} />
                  </div>
                  <div className="arow">
                    <b>Ana · Pix QR</b>
                    <span className="amt">R$ 54 of R$ 800</span>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <i style={{ width: "7%" }} />
                  </div>
                  <div className="arow">
                    <b>Arya · QRIS, Indonesia</b>
                    <span className="amt">Rp 0 of Rp 3.200.000</span>
                  </div>
                  <div className="meter" aria-hidden="true">
                    <i style={{ width: "0%" }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="c5 feature-copy">
              <h2 id="spend-h" className="sx-h heading-2">
                Cards and local QR for your <em>team</em>.
              </h2>
              <p className="body-l">
                Give people a virtual card, or a Pix, QRIS or PromptPay QR, with a limit in the currency they spend in.
              </p>
              <Ticks
                items={[
                  "Cards hold the rest of their limit in your balance",
                  "Every purchase shows up as it happens",
                  "Freeze a card or pause a QR in one tap",
                ]}
              />
            </div>
          </div>
        </section>

        <section className="sec rule-top" aria-labelledby="rules-h">
          <div className="wrap">
            <div className="sec-head">
              <div>
                <h2 id="rules-h" className="sx-h heading-2">
                  Rules your money <em>keeps</em>.
                </h2>
              </div>
              <p className="body muted">
                Limits, holds and approvals are enforced by code, not by a reminder in someone&apos;s inbox.
              </p>
            </div>
            <div className="bento">
              <article className="tile" style={{ gridColumn: "span 7" }}>
                <h3>Big or unusual payments wait for a yes.</h3>
                <p>
                  Set a limit in dollars. Payments over it, or to someone new, go to an approver. Nobody approves their
                  own.
                </p>
                <div className="tile-art">
                  <div className="arow">
                    <b>Ana → Gráfica Aurora</b>
                    <span className="amt">$592.05</span>
                    <small>Over her limit</small>
                    <span className="sx-pill sx-pill--pending">Pending</span>
                  </div>
                  <div className="arow">
                    <b>Rafael → Torrefação Lisboa</b>
                    <span className="amt">$1,988.00</span>
                    <small>First payment to someone new</small>
                    <span className="sx-pill sx-pill--pending">Pending</span>
                  </div>
                  <div className="arow">
                    <b>Payments agent → Crop imagery</b>
                    <span className="amt">$40.00</span>
                    <small>Over its weekly budget</small>
                    <span className="sx-pill sx-pill--pending">Pending</span>
                  </div>
                </div>
              </article>
              <article className="tile tile--deep" style={{ gridColumn: "span 5" }}>
                <h3>Agents get a budget, not a blank check.</h3>
                <p>Your payments agent buys data and tools within a weekly budget. Anything over it comes to you.</p>
                <div className="tile-art">
                  <div className="arow">
                    <b>This week</b>
                    <span className="amt">$12.40 of $50.00</span>
                  </div>
                  <div className="meter" style={{ background: "rgba(238,241,236,.14)" }} aria-hidden="true">
                    <i style={{ width: "25%", background: "var(--brand-signal)" }} />
                  </div>
                  <div className="arow">
                    <b>Budget resets Monday</b>
                    <span className="amt amt-in">$37.60 left</span>
                  </div>
                </div>
              </article>
              <article className="tile" style={{ gridColumn: "span 5" }}>
                <h3>Every hop has a receipt.</h3>
                <p>Each step of a payment carries its own status, so you always know where the money is.</p>
                <div className="tile-art">
                  <div className="arow">
                    <b>Funded from balance</b>
                    <span className="amt">$100.80</span>
                  </div>
                  <div className="arow">
                    <b>Converted at 5.4123</b>
                    <span className="amt">R$ 541,23</span>
                  </div>
                  <div className="arow">
                    <b>Paid out by Pix</b>
                    <span className="sx-pill sx-pill--settled">Settled</span>
                  </div>
                  <div className="arow">
                    <b>Received by Juliana</b>
                    <span className="sx-pill sx-pill--settled">Settled</span>
                  </div>
                </div>
              </article>
              <article className="tile" style={{ gridColumn: "span 7" }}>
                <h3>Earn when other agents use your data.</h3>
                <p>
                  Publish an endpoint and set a price per call. What other agents pay lands straight in your balance.
                </p>
                <div className="tile-art">
                  <div className="arow">
                    <b>Route quotes</b>
                    <span className="amt">$0.04 a call</span>
                    <small>Paid by other agents</small>
                    <span className="sx-pill sx-pill--settled">Live</span>
                  </div>
                  <div className="arow">
                    <b>Earned so far</b>
                    <span className="amt" style={{ color: "var(--settled)" }}>
                      +$1.20
                    </span>
                    <small>30 calls</small>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="band" aria-labelledby="band-h">
          <svg className="band-lines" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1">
              <circle cx="600" cy="420" r="180" />
              <circle cx="600" cy="420" r="300" />
              <circle cx="600" cy="420" r="420" />
              <circle cx="600" cy="420" r="540" />
            </g>
          </svg>
          <div className="wrap" style={{ position: "relative" }}>
            <h2 id="band-h" className="sx-h display-l">
              One card. <em>Settled</em> in local currency.
            </h2>
            <div className="stack" aria-hidden="true">
              <VirtualCard className="s1" limit="Rp 3.200.000" name="ARYA PUTRA" num="•••• 5530" />
              <VirtualCard className="s2" limit="฿12,000" name="NIDA SRISAI" num="•••• 8816" />
              <VirtualCard className="s3" mark limit="R$ 2.700" name="ANA SOUZA" num="•••• 4021" />
            </div>
            <p className="band-foot">
              <span>Ana paid Papelaria Central</span>
              <span className="data">$100.00 → R$ 541,23</span>
              <span className="sx-pill sx-pill--settled">Settled</span>
            </p>
          </div>
        </section>

        <section className="sec white" aria-labelledby="faq-h">
          <div className="wrap g12">
            <div className="c4" style={{ display: "grid", gap: 12, alignContent: "start" }}>
              <h2 id="faq-h" className="sx-h heading-2">
                Before you open an account
              </h2>
            </div>
            <div className="c8 faq">
              <FaqItem q="Is this a real bank account?" open>
                Sancus is a dollar business account, not a traditional bank. Your balance is held 1:1 as USDC, and you
                pay out on local rails your suppliers already use.
              </FaqItem>
              <FaqItem q="Where can I pay?">
                Brazil by Pix, Mexico by SPEI, the euro area by SEPA, Indonesia by QRIS, Thailand by PromptPay, the US
                by ACH, anywhere by wire, and any business with a USDC account.
              </FaqItem>
              <FaqItem q="How fast does money arrive?">
                Pix, QRIS, PromptPay and USDC arrive in seconds, SPEI in minutes, SEPA the same day, and ACH in 1–2
                days. Review shows the arrival time before you pay.
              </FaqItem>
              <FaqItem q="What does it cost?">
                Each rail has its own fee, from $0.00 for USDC to $3.50 for a wire. You see the fee and the rate before
                you confirm. <Link href="/pricing">Rails and fees</Link>
              </FaqItem>
              <FaqItem q="Who holds the money?">
                Your balance is held as USDC, one for one, and the rules on it are enforced by a contract.{" "}
                <Link href="/security">How your money is kept</Link>
              </FaqItem>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

function FaqItem({ q, open, children }: { q: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open}>
      <summary>
        {q}
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <p className="body">{children}</p>
    </details>
  )
}
