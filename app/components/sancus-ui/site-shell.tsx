import Link from "next/link"
import type { ReactNode } from "react"
import { DemoLink } from "./demo-link"
import { RisingColumn } from "./logo"
import { SiteNavLinks, type SiteNavKey } from "./site-nav-links"

export type { SiteNavKey }

const FOOTER_LINKS: { href: string; label: string; external?: boolean }[] = [
  { href: "/#how", label: "How it works" },
  { href: "/pricing", label: "Rails and fees" },
  { href: "/security", label: "Security" },
  { href: "/pay", label: "Pay" },
  { href: "/spending", label: "Cards and QR" },
  { href: "/agents", label: "Agents" },
  { href: "https://github.com/vysha-exe/Sancus", label: "Source code", external: true },
  { href: "#terms", label: "Terms" },
  { href: "#privacy", label: "Privacy" },
]

/** Public marketing chrome: top nav and footer. Pages supply their own header and main. */
export function SiteShell({ active, children }: { active?: SiteNavKey; children: ReactNode }) {
  return (
    <div className="sx site" data-theme="day">
      <nav className="snav" aria-label="Main">
        <div className="wrap">
          <Link href="/" className="sx-lockup sx-wordmark" aria-label="Sancus home">
            <RisingColumn />
            SANCUS
          </Link>
          <SiteNavLinks active={active} />
          <div className="snav-end">
            <Link className="plain" href="/sign-in">
              Sign in
            </Link>
            <Link className="sx-btn sx-btn--primary" href="/sign-up">
              Open your account
            </Link>
          </div>
        </div>
      </nav>
      {children}
      <SiteFooter />
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="foot">
      <div className="foot-panel">
        <svg className="foot-lines" viewBox="0 0 1400 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="1080" cy="780" r="560" />
            <ellipse cx="1080" cy="634" rx="541" ry="108" />
            <ellipse cx="1080" cy="500" rx="485" ry="97" />
            <ellipse cx="1080" cy="382" rx="396" ry="79" />
            <ellipse cx="1080" cy="293" rx="280" ry="56" />
            <ellipse cx="1080" cy="237" rx="146" ry="29" />
            <ellipse cx="1080" cy="780" rx="146" ry="560" />
            <ellipse cx="1080" cy="780" rx="280" ry="560" />
            <ellipse cx="1080" cy="780" rx="398" ry="560" />
            <ellipse cx="1080" cy="780" rx="487" ry="560" />
            <ellipse cx="1080" cy="780" rx="543" ry="560" />
            <line x1="1080" y1="220" x2="1080" y2="1340" />
          </g>
          <g fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M660 620 Q 780 220 1040 310" />
            <path d="M1040 310 Q 1280 140 1410 450" />
          </g>
        </svg>
        <div className="foot-in">
          <div className="foot-cta">
            <h2 className="sx-h heading-1">
              Money that keeps its <em>word</em>.
            </h2>
            <div className="hero-ctas">
              <Link className="sx-btn sx-btn--primary" href="/sign-up">
                Open your account
              </Link>
              <DemoLink className="sx-btn sx-btn--secondary">Try the demo</DemoLink>
            </div>
          </div>
          <div className="foot-meta">
            <span>One account. Every rail. Every border.</span>
            <hr />
          </div>
          <ul className="foot-links" aria-label="Footer">
            {FOOTER_LINKS.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a href={l.href} rel="noreferrer">
                    {l.label}
                  </a>
                ) : l.href.startsWith("#") ? (
                  <a href={l.href}>{l.label}</a>
                ) : (
                  <Link href={l.href}>{l.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="foot-word" aria-hidden="true">
          SANCUS
        </div>
      </div>
    </footer>
  )
}
