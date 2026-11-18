"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react"
import { useSignUp, validInviteCount } from "@/lib/sancus/sign-up-state"
import { AuthShell, BUSINESS_SIGN_UP_STEPS, PERSONAL_SIGN_UP_STEPS } from "./auth-shell"

function SignInLink() {
  return (
    <>
      Have an account? <Link href="/sign-in">Sign in</Link>
    </>
  )
}

/** Step 1: name and email. */
export function SignUpEmailStep() {
  const router = useRouter()
  const { data, update } = useSignUp()
  const ready = data.agreed && data.firstName.trim() !== "" && data.email.trim() !== ""

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) router.push("/sign-up/code")
  }

  return (
    <AuthShell step={0} headEnd={<SignInLink />}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 1 of 6</span>
          <h1 id="q" className="sx-h heading-1">
            Let&apos;s start with your email.
          </h1>
        </div>
        <div className="auth-fields">
          <label className="sx-field">
            <span className="sx-label">First name</span>
            <input
              className="sx-field__input"
              autoComplete="given-name"
              value={data.firstName}
              onChange={(e) => update({ firstName: e.target.value })}
            />
          </label>
          <label className="sx-field">
            <span className="sx-label">Work email</span>
            <input
              className="sx-field__input"
              type="email"
              autoComplete="email"
              value={data.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={data.agreed} onChange={(e) => update({ agreed: e.target.checked })} />
            <span>
              I agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy policy</a>.
            </span>
          </label>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!ready}>
            Continue
          </button>
          <Link href="/demo" className="sx-btn sx-btn--secondary">
            Try the demo
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

/** Step 2: six-digit code. Mock: any six digits work. */
export function SignUpCodeStep() {
  const router = useRouter()
  const { data } = useSignUp()
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""])
  const [wait, setWait] = useState(42)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const full = digits.every((d) => d !== "")

  function setAt(i: number, value: string) {
    const d = value.replace(/\D/g, "").slice(-1)
    setDigits((prev) => prev.map((x, j) => (j === i ? d : x)))
    if (d && i < 5) refs.current[i + 1]?.focus()
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    setDigits(Array.from({ length: 6 }, (_, j) => pasted[j] ?? ""))
    refs.current[Math.min(pasted.length, 5)]?.focus()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (full) router.push("/sign-up/account-type")
  }

  return (
    <AuthShell step={1}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 2 of 6</span>
          <h1 id="q" className="sx-h heading-1">
            Enter the six-digit code
          </h1>
          <p className="body-l lead">We sent it to {data.email}.</p>
        </div>
        <div className="code" role="group" aria-label="Six-digit code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el
              }}
              className="sx-field__input"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              onPaste={onPaste}
            />
          ))}
        </div>
        <div className="auth-row">
          {wait > 0 ? (
            <span className="data">Resend in 0:{String(wait).padStart(2, "0")}</span>
          ) : (
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => setWait(42)}>
              Resend code
            </button>
          )}
          <Link href="/sign-up">Change email</Link>
        </div>
        <span className="sx-field__help" style={{ marginTop: -12 }}>
          Enter the six-digit code we sent.
        </span>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!full}>
            Continue
          </button>
          <Link href="/sign-up" className="sx-btn sx-btn--secondary">
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

const COUNTRIES = ["Brazil", "Mexico", "Indonesia", "Thailand", "Portugal", "United States"]

/** After code: Personal (B2C) vs Business (B2B). */
export function SignUpAccountTypeStep() {
  const router = useRouter()
  const { data, update } = useSignUp()

  function choose(accountType: "personal" | "business") {
    update({ accountType })
    router.push(accountType === "personal" ? "/sign-up/about-you" : "/sign-up/company")
  }

  return (
    <AuthShell step={2}>
      <form
        aria-labelledby="q"
        onSubmit={(e) => {
          e.preventDefault()
          if (data.accountType) choose(data.accountType)
        }}
      >
        <div className="auth-q">
          <span className="sx-label">Step 3 of 6</span>
          <h1 id="q" className="sx-h heading-1">
            What kind of account?
          </h1>
          <p className="body-l lead">Start personal and you can open a business later.</p>
        </div>
        <div
          className="opts"
          role="radiogroup"
          aria-label="Account type"
          style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={data.accountType === "personal"}
            className={data.accountType === "personal" ? "opt opt--on" : "opt"}
            onClick={() => update({ accountType: "personal" })}
          >
            <span className="code3" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
            </span>
            <b>Personal</b>
            <small>Just you. One account to pay and get paid. 5 steps.</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={data.accountType === "business"}
            className={data.accountType === "business" ? "opt opt--on" : "opt"}
            onClick={() => update({ accountType: "business" })}
          >
            <span className="code3" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="5" rx="1" />
                <rect x="3" y="16" width="6" height="5" rx="1" />
                <rect x="15" y="16" width="6" height="5" rx="1" />
                <path d="M12 8v4M6 16v-4h12v4" />
              </svg>
            </span>
            <b>Business</b>
            <small>A company with a team, branches and approvals. 6 steps.</small>
          </button>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!data.accountType}>
            Continue
          </button>
          <Link href="/sign-up/code" className="sx-btn sx-btn--secondary">
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

/** Personal path: About you (name + country). */
export function SignUpAboutYouStep() {
  const router = useRouter()
  const { data, update } = useSignUp()
  const ready = data.fullName.trim() !== ""

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    const first = data.fullName.trim().split(/\s+/)[0] ?? data.firstName
    update({ firstName: first })
    router.push("/sign-up/currency")
  }

  return (
    <AuthShell step={3} steps={PERSONAL_SIGN_UP_STEPS}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 4 of 5</span>
          <h1 id="q" className="sx-h heading-1">
            About you
          </h1>
          <p className="body-l lead">As it appears on your ID.</p>
        </div>
        <div className="auth-fields">
          <label className="sx-field">
            <span className="sx-label">Full name</span>
            <input
              className="sx-field__input"
              autoComplete="name"
              value={data.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
            />
          </label>
          <label className="sx-field">
            <span className="sx-label">Country you live in</span>
            <select
              className="sx-field__input"
              value={data.country}
              onChange={(e) => update({ country: e.target.value })}
            >
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="sx-field__help">Optional for now. You can add your CPF later in Settings.</span>
          </label>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!ready}>
            Continue
          </button>
          <Link href="/sign-up/account-type" className="sx-btn sx-btn--secondary">
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

/** Step 4 (business): company (was the standalone onboarding screen). */
export function SignUpCompanyStep() {
  const router = useRouter()
  const { data, update } = useSignUp()
  const ready = data.company.trim() !== ""

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) router.push("/sign-up/currency")
  }

  return (
    <AuthShell step={3} steps={BUSINESS_SIGN_UP_STEPS}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 4 of 6</span>
          <h1 id="q" className="sx-h heading-1">
            What&apos;s your company called?
          </h1>
          <p className="body-l lead">
            Use the legal name on your registration. You can add a trading name later.
          </p>
        </div>
        <div className="auth-fields">
          <label className="sx-field">
            <span className="sx-label">Legal name</span>
            <input
              className="sx-field__input"
              autoComplete="organization"
              value={data.company}
              onChange={(e) => update({ company: e.target.value })}
            />
          </label>
          <label className="sx-field">
            <span className="sx-label">Country of registration</span>
            <select
              className="sx-field__input"
              value={data.country}
              onChange={(e) => update({ country: e.target.value })}
            >
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="sx-field__help">
              Optional for now. You can add your CNPJ later in Settings.
            </span>
          </label>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!ready}>
            Continue
          </button>
          <Link href="/sign-up/account-type" className="sx-btn sx-btn--secondary">
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

const CURRENCIES: [code: string, name: string, note: string][] = [
  ["BRL", "Brazilian real", "Suggested for Brazil"],
  ["USD", "US dollar", "Dollars only"],
  ["MXN", "Mexican peso", "Mexico"],
  ["EUR", "Euro", "Euro area"],
]

/** Step 4: home currency. */
export function SignUpCurrencyStep() {
  const router = useRouter()
  const { data, update } = useSignUp()

  function submit(e: FormEvent) {
    e.preventDefault()
    router.push(data.accountType === "personal" ? "/sign-up/done" : "/sign-up/team")
  }

  return (
    <AuthShell
      step={4}
      steps={data.accountType === "personal" ? PERSONAL_SIGN_UP_STEPS : BUSINESS_SIGN_UP_STEPS}
    >
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">{data.accountType === "personal" ? "Step 5 of 5" : "Step 5 of 6"}</span>
          <h1 id="q" className="sx-h heading-1">
            Pick your home currency
          </h1>
          <p className="body-l lead">
            We&apos;ll show amounts in it next to dollars. Your balance stays in US dollars.
          </p>
        </div>
        <div className="opts" role="radiogroup" aria-label="Home currency">
          {CURRENCIES.map(([code, name, note]) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={code === data.currency}
              className={code === data.currency ? "opt opt--on" : "opt"}
              onClick={() => update({ currency: code })}
            >
              <span className="code3">{code}</span>
              <b>{name}</b>
              <small>{note}</small>
            </button>
          ))}
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary">
            Continue
          </button>
          <Link
            href={data.accountType === "personal" ? "/sign-up/about-you" : "/sign-up/company"}
            className="sx-btn sx-btn--secondary"
          >
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

const ROLES = ["Finance", "Employee", "Viewer"]

/** Step 6 (business): invite the team. Optional. */
export function SignUpTeamStep() {
  const router = useRouter()
  const { data, update } = useSignUp()
  const count = validInviteCount(data.invites)

  function setInvite(i: number, patch: Partial<{ email: string; role: string }>) {
    update({ invites: data.invites.map((inv, j) => (j === i ? { ...inv, ...patch } : inv)) })
  }

  function send(e: FormEvent) {
    e.preventDefault()
    update({ invitesSent: count })
    router.push("/sign-up/done")
  }

  return (
    <AuthShell step={5} steps={BUSINESS_SIGN_UP_STEPS}>
      <form aria-labelledby="q" onSubmit={send}>
        <div className="auth-q">
          <span className="sx-label">Step 6 of 6</span>
          <h1 id="q" className="sx-h heading-1">
            Invite your team
          </h1>
          <p className="body-l lead">
            They&apos;ll get an email to join {data.company.trim() || "your company"}. You can do this later.
          </p>
        </div>
        <div className="auth-fields" style={{ gap: 10 }}>
          <span className="sx-label">Email and role</span>
          {data.invites.map((inv, i) => (
            <div className="invite" key={i}>
              <input
                className="sx-field__input"
                type="email"
                aria-label={`Email ${i + 1}`}
                placeholder="name@company.com"
                value={inv.email}
                onChange={(e) => setInvite(i, { email: e.target.value })}
              />
              <select
                className="sx-field__input"
                aria-label={`Role ${i + 1}`}
                value={inv.role}
                onChange={(e) => setInvite(i, { role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            className="sx-btn sx-btn--quiet"
            style={{ justifySelf: "start" }}
            onClick={() => update({ invites: [...data.invites, { email: "", role: "Employee" }] })}
          >
            Add another
          </button>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={count === 0}>
            {count === 0 ? "Send invites" : `Send ${count} ${count === 1 ? "invite" : "invites"}`}
          </button>
          <Link
            href="/sign-up/done"
            className="sx-btn sx-btn--secondary"
            onClick={() => update({ invitesSent: 0 })}
          >
            Skip for now
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

const ARROW = (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

/** Done: account is ready, with the first three things to do. Provisions business company when needed. */
export function SignUpDoneStep() {
  const { data, update } = useSignUp()
  const [busy, setBusy] = useState(false)
  const personal = data.accountType === "personal"
  // Business accounts are addressed by the business, never a person.
  const name = personal ? data.firstName.trim() || "there" : data.company.trim() || "your business"
  const meta = [
    `Home currency ${data.currency}`,
    !personal && data.invitesSent > 0
      ? `${data.invitesSent} ${data.invitesSent === 1 ? "invite" : "invites"} sent`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  useEffect(() => {
    if (personal || data.createdCompanyId) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      const { SIGNUP_COUNTRY_TO_CODE, setWorkspaceCompany } = await import("@/lib/sancus/workspace")
      try {
        const country = SIGNUP_COUNTRY_TO_CODE[data.country] ?? "BR"
        const res = await fetch("/api/sancus/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.company.trim() || "My company",
            country,
            currency: data.currency,
          }),
        })
        const body = await res.json()
        if (cancelled) return
        if (!res.ok) {
          update({ provisioningError: body.error ?? "Could not create your company" })
          setBusy(false)
          return
        }
        const id = body.company?.id as string | undefined
        if (id) {
          setWorkspaceCompany(id)
          update({ createdCompanyId: id, provisioningError: null })
          const roleMap: Record<string, string> = {
            Finance: "FINANCE",
            Employee: "EMPLOYEE",
            Viewer: "VIEWER",
            Admin: "ADMIN",
          }
          for (const inv of data.invites) {
            const email = inv.email.trim()
            if (!/^\S+@\S+\.\S+$/.test(email)) continue
            await fetch(`/api/sancus/companies/${id}/members`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, role: roleMap[inv.role] ?? "EMPLOYEE" }),
            })
          }
        }
      } catch {
        if (!cancelled) update({ provisioningError: "Could not reach the server" })
      }
      if (!cancelled) setBusy(false)
    })()
    return () => {
      cancelled = true
    }
    // Provision once when the done screen mounts for business accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal, data.createdCompanyId])

  useEffect(() => {
    if (!personal) return
    void import("@/lib/sancus/workspace").then(({ setWorkspacePersonal }) => setWorkspacePersonal())
  }, [personal])

  return (
    <AuthShell
      step={personal ? PERSONAL_SIGN_UP_STEPS.length : BUSINESS_SIGN_UP_STEPS.length}
      steps={personal ? PERSONAL_SIGN_UP_STEPS : BUSINESS_SIGN_UP_STEPS}
    >
      <div className="panel-col">
        <div className="auth-q">
          <h1 id="q" className="sx-h heading-1">
            You&apos;re all set, {name}.
          </h1>
          <p className="body-l lead">
            {personal
              ? "Your personal US dollar account is ready. Add money to make your first payment."
              : `${data.company.trim() || "Your company"} has a US dollar account. Add money to make your first payment.`}
          </p>
          {busy ? <p className="body-s muted">Setting up your company…</p> : null}
          {data.provisioningError ? <p className="body-s">{data.provisioningError}</p> : null}
        </div>
        <div className="ready">
          <div className="ready-top">
            <span className="sx-label">Available balance</span>
            <span className="amount-xl">$0.00</span>
            <span className="body-s muted">{meta}</span>
          </div>
          <ul className="next">
            <li>
              <Link href="/receive">
                <span className="i">1</span>
                <span>
                  Add money<small>{personal ? "Pix, ACH or USDC" : "ACH, wire or USDC"}</small>
                </span>
                {ARROW}
              </Link>
            </li>
            {personal ? (
              <li>
                <Link href="/branches">
                  <span className="i">2</span>
                  <span>
                    Open a business<small>When you need a team and branches</small>
                  </span>
                  {ARROW}
                </Link>
              </li>
            ) : (
              <li>
                <Link href="/settings">
                  <span className="i">2</span>
                  <span>
                    Set approval rules<small>Who approves what, and over how much</small>
                  </span>
                  {ARROW}
                </Link>
              </li>
            )}
            <li>
              <Link href={personal ? "/pay" : "/spending"}>
                <span className="i">3</span>
                <span>
                  {personal ? (
                    <>
                      Make a payment<small>Anyone, in their currency</small>
                    </>
                  ) : (
                    <>
                      Give someone a card or QR<small>Limits in their own currency</small>
                    </>
                  )}
                </span>
                {ARROW}
              </Link>
            </li>
          </ul>
        </div>
        <div className="auth-btns">
          <Link href="/home" className="sx-btn sx-btn--primary">
            Go to Home
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
