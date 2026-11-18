import Link from "next/link"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { DEMO_LOGIN_PATH, isDemoLoginEnabled } from "@/lib/sancus/demo-login"
import "@/styles/sancus/sancus.css"

const DEMO_HREF = `${DEMO_LOGIN_PATH}?next=${encodeURIComponent("/home")}`

/** Temporary placeholder landing — real marketing page comes later. */
export default function LandingPage() {
  const demoEnabled = isDemoLoginEnabled()
  const demoHref = demoEnabled ? DEMO_HREF : "/auth/login"

  return (
    <main className="sancus-landing">
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          gap: 16,
        }}
      >
        <Link
          href="/"
          className="sx-lockup sx-wordmark"
          style={{ color: "#E4EAE6", textDecoration: "none", fontSize: 20 }}
          aria-label="Sancus"
        >
          <RisingColumn />
          <span>SANCUS</span>
        </Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/auth/login" className="sx-btn sx-btn--quiet" style={{ color: "#E4EAE6" }}>
            Sign in
          </Link>
          <Link href="/auth/sign-up" className="sx-btn sx-btn--secondary" style={{ color: "#E4EAE6", borderColor: "#5C706B" }}>
            Open an account
          </Link>
          {/* Full navigation so the demo-login Set-Cookie + redirect stick. */}
          <a
            href={demoHref}
            className="sx-btn sx-btn--primary"
            style={{ background: "var(--brand-signal)", color: "var(--brand-night)" }}
          >
            Open demo
          </a>
        </div>
      </nav>

      <div
        style={{
          flex: 1,
          display: "grid",
          alignContent: "center",
          justifyItems: "start",
          gap: 20,
          padding: "48px 32px 96px",
          maxWidth: 720,
        }}
      >
        <span className="label" style={{ color: "var(--brand-signal)" }}>
          Placeholder
        </span>
        <h1 className="sx-h display-l" style={{ margin: 0, color: "#E4EAE6" }}>
          A dollar account that pays <em style={{ color: "var(--brand-signal)", fontStyle: "italic" }}>anyone</em>
        </h1>
        <p className="body-l" style={{ margin: 0, color: "#94A39E", maxWidth: "42ch" }}>
          Marketing page coming soon. For now, jump into the Café Paulista demo — no signup required.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <a
            href={demoHref}
            className="sx-btn sx-btn--primary"
            style={{ background: "var(--brand-signal)", color: "var(--brand-night)" }}
          >
            Enter the demo
          </a>
          <Link href="/auth/sign-up" className="sx-btn sx-btn--secondary" style={{ color: "#E4EAE6", borderColor: "#5C706B" }}>
            Open an account
          </Link>
        </div>
        {!demoEnabled ? (
          <p className="body-s" style={{ margin: 0, color: "#5C706B", maxWidth: "48ch" }}>
            Demo auto-login is off. Set <code>SANCUS_DEMO_LOGIN=true</code> and a demo password in{" "}
            <code>.env.local</code>, then restart the app.
          </p>
        ) : null}
      </div>
    </main>
  )
}
