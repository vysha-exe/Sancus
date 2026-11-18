"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react"
import { useSignUp, validInviteCount } from "@/lib/sancus/sign-up-state"
import { AuthShell } from "./auth-shell"

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
    <AuthShell done={0} headEnd={<SignInLink />}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 1 of 5</span>
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
          <Link href="/home" className="sx-btn sx-btn--secondary">
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
    if (full) router.push("/sign-up/company")
  }

  return (
    <AuthShell done={1}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 2 of 5</span>
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
          Sandbox: any six digits will do.
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

/** Step 3: company (was the standalone onboarding screen). */
export function SignUpCompanyStep() {
  const router = useRouter()
  const { data, update } = useSignUp()
  const ready = data.company.trim() !== ""

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) router.push("/sign-up/currency")
  }

  return (
    <AuthShell done={2}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 3 of 5</span>
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
              We&apos;ll ask for your CNPJ when you go live. Not needed in the sandbox.
            </span>
          </label>
        </div>
        <div className="auth-btns">
          <button type="submit" className="sx-btn sx-btn--primary" disabled={!ready}>
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
    router.push("/sign-up/team")
  }

  return (
    <AuthShell done={3}>
      <form aria-labelledby="q" onSubmit={submit}>
        <div className="auth-q">
          <span className="sx-label">Step 4 of 5</span>
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
          <Link href="/sign-up/company" className="sx-btn sx-btn--secondary">
            Back
          </Link>
        </div>
      </form>
    </AuthShell>
  )
}

const ROLES = ["Finance", "Employee", "Viewer"]

/** Step 5: invite the team. Optional. */
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
    <AuthShell done={4}>
      <form aria-labelledby="q" onSubmit={send}>
        <div className="auth-q">
          <span className="sx-label">Step 5 of 5</span>
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

/** Done: account is ready, with the first three things to do. */
export function SignUpDoneStep() {
  const { data } = useSignUp()
  const name = data.firstName.trim() || "there"
  const meta = [
    `Home currency ${data.currency}`,
    data.invitesSent > 0 ? `${data.invitesSent} ${data.invitesSent === 1 ? "invite" : "invites"} sent` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <AuthShell done={5}>
      <div className="panel-col">
        <div className="auth-q">
          <h1 id="q" className="sx-h heading-1">
            You&apos;re all set, {name}.
          </h1>
          <p className="body-l lead">
            {data.company.trim() || "Your company"} has a US dollar account. Add money to make your first payment.
          </p>
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
                  Add money<small>ACH, wire or USDC</small>
                </span>
                {ARROW}
              </Link>
            </li>
            <li>
              <Link href="/settings">
                <span className="i">2</span>
                <span>
                  Set approval rules<small>Who approves what, and over how much</small>
                </span>
                {ARROW}
              </Link>
            </li>
            <li>
              <Link href="/spending">
                <span className="i">3</span>
                <span>
                  Give someone a card or QR<small>Limits in their own currency</small>
                </span>
                {ARROW}
              </Link>
            </li>
          </ul>
        </div>
        <div className="auth-btns">
          <Link href="/home/empty" className="sx-btn sx-btn--primary">
            Go to Home
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
