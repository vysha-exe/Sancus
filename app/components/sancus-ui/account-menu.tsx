"use client"

// Header account button: who you're signed in as, plus Log out (or Sign in for the guest demo).
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { resetAccountCache } from "@/lib/sancus/use-account"
import { setWorkspacePersonal } from "@/lib/sancus/workspace"

export function AccountMenu({
  name,
  role,
  email,
  signedIn,
}: {
  name: string
  role: string
  email: string | null
  signedIn: boolean
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  async function logOut() {
    setBusy(true)
    try {
      await createClient().auth.signOut()
    } catch {
      /* still leave the app */
    }
    resetAccountCache()
    setWorkspacePersonal() // forget the selected company
    try {
      sessionStorage.removeItem("sancus:admin-ws")
      sessionStorage.removeItem("sancus:treasury-ensured")
    } catch {
      /* storage blocked */
    }
    window.location.assign("/") // full reload so no signed-in state lingers
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="me"
        aria-label={`Account: ${name}, ${role}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="av">{name.slice(0, 1).toUpperCase()}</span>
        <span className="me-txt">
          {name}
          <small>{role}</small>
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 220,
            zIndex: 50,
            display: "grid",
            gap: 4,
            padding: 8,
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--surface-000, #fff)",
            boxShadow: "var(--shadow-xl, 0 12px 32px rgba(0,0,0,.14))",
          }}
        >
          <div style={{ padding: "6px 8px", display: "grid", gap: 2 }}>
            <span className="body-strong">{name}</span>
            <span className="body-s muted">{email ?? role}</span>
            {email ? <span className="body-s muted">{role}</span> : null}
          </div>
          <div style={{ borderTop: "1px solid var(--line)", margin: "4px 0" }} />
          <Link href="/settings" role="menuitem" className="sx-btn sx-btn--quiet sx-btn--sm" style={{ justifyContent: "flex-start" }} onClick={() => setOpen(false)}>
            Settings
          </Link>
          {signedIn ? (
            <button type="button" role="menuitem" className="sx-btn sx-btn--quiet sx-btn--sm" style={{ justifyContent: "flex-start" }} onClick={logOut} disabled={busy}>
              {busy ? "Logging out…" : "Log out"}
            </button>
          ) : (
            <Link href="/sign-in" role="menuitem" className="sx-btn sx-btn--quiet sx-btn--sm" style={{ justifyContent: "flex-start" }}>
              Sign in
            </Link>
          )}
        </div>
      ) : null}
    </div>
  )
}
