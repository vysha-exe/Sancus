"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { RisingColumn } from "@/components/sancus-ui/logo"
import { DEMO_LOGIN_PATH } from "@/lib/sancus/demo-login"
import "@/styles/sancus/sancus.css"

const muted = "#94A39E"
const AFTER_ONBOARDING = `${DEMO_LOGIN_PATH}?next=${encodeURIComponent("/home")}`

export default function OnboardingPage() {
  const [company, setCompany] = useState("Café Paulista Ltda")
  const [country, setCountry] = useState("Brazil")

  function submit(e: FormEvent) {
    e.preventDefault()
    // Full navigation through demo login so the session cookie is set before /home.
    window.location.assign(AFTER_ONBOARDING)
  }

  return (
    <div
      className="sx sx-night"
      data-theme="night"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
        background: "var(--brand-night)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        style={{
          position: "absolute",
          right: -120,
          top: "50%",
          width: 720,
          height: 720,
          transform: "translateY(-50%)",
          opacity: 0.3,
          color: "var(--brand-signal)",
        }}
      >
        <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeWidth="1" />
        <ellipse cx="200" cy="200" rx="190" ry="60" fill="none" stroke="currentColor" strokeWidth=".6" />
        <ellipse cx="200" cy="200" rx="190" ry="125" fill="none" stroke="currentColor" strokeWidth=".6" />
        <ellipse cx="200" cy="200" rx="60" ry="190" fill="none" stroke="currentColor" strokeWidth=".6" />
        <ellipse cx="200" cy="200" rx="125" ry="190" fill="none" stroke="currentColor" strokeWidth=".6" />
        <line x1="200" y1="10" x2="200" y2="390" stroke="currentColor" strokeWidth=".6" />
        <path d="M150 250 Q 200 120 290 170" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M150 250 Q 110 150 120 120" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="150" cy="250" r="4" fill="currentColor" />
      </svg>

      <header
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 32px",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span className="sx-lockup sx-wordmark" style={{ color: "#E4EAE6", fontSize: 20 }}>
          <RisingColumn />
          SANCUS
        </span>
        <span className="sx-pill sx-pill--simulated" style={{ color: muted, borderColor: "#5C706B" }}>
          Sandbox · testnet
        </span>
      </header>

      <main
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px 72px",
        }}
      >
        <form
          onSubmit={submit}
          aria-labelledby="q"
          style={{ width: "100%", maxWidth: 440, display: "flex", flexDirection: "column", gap: 28 }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <span className="sx-label" style={{ color: muted }}>
              Step 3 of 5
            </span>
            <h1 id="q" className="sx-h heading-1" style={{ fontSize: 44 }}>
              What&apos;s your company <em>called</em>?
            </h1>
            <p className="body-l" style={{ margin: 0, color: muted }}>
              Use the legal name on your registration. You can add a trading name later.
            </p>
          </div>

          <label className="sx-field">
            <span className="sx-label" style={{ color: muted }}>
              Legal name
            </span>
            <input
              className="sx-field__input"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              autoComplete="organization"
            />
          </label>
          <label className="sx-field">
            <span className="sx-label" style={{ color: muted }}>
              Country of registration
            </span>
            <select
              className="sx-field__input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option>Brazil</option>
              <option>Mexico</option>
              <option>United States</option>
              <option>Portugal</option>
            </select>
            <span className="sx-field__help" style={{ color: muted }}>
              We&apos;ll ask for your CNPJ when you go live. Not needed in the sandbox.
            </span>
          </label>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="submit"
              className="sx-btn sx-btn--primary"
              style={{ flex: "1 1 auto" }}
              disabled={company.trim().length === 0}
            >
              Continue
            </button>
            <Link href="/" className="sx-btn sx-btn--secondary">
              Back
            </Link>
          </div>

          <ol
            className="body-s"
            style={{
              margin: 0,
              padding: "16px 0 0 20px",
              borderTop: "1px solid #26332F",
              color: muted,
              display: "grid",
              gap: 6,
            }}
          >
            <li>
              What&apos;s your email? <span style={{ color: "var(--brand-signal)" }}>Done</span>
            </li>
            <li>
              Enter the six-digit code <span style={{ color: "var(--brand-signal)" }}>Done</span>
            </li>
            <li style={{ color: "#E4EAE6" }}>Company name and country</li>
            <li>Your home currency (we suggest BRL)</li>
            <li>Invite your team (optional) → &quot;You&apos;re all set, Maya.&quot;</li>
          </ol>
        </form>
      </main>
    </div>
  )
}
