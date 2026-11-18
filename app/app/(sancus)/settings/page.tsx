"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { rails, workspace } from "@/lib/sancus/demo-data"
import { useSancusPrefs, type SancusTheme } from "@/lib/sancus/prefs"
import { useLiveTreasury } from "@/lib/sancus/use-live-treasury"
import { TreasurySetup } from "@/components/sancus-ui/treasury-setup"
import { displayMinor, formatMinor, parseToMinor, USDC_DECIMALS } from "@/lib/sancus/money"
import { useWorkspace } from "@/lib/sancus/use-workspace"

type RuleId = "threshold" | "twoSignoffs" | "newRecipients" | "afterHours"

const ruleList: { id: RuleId; title: string; help?: string }[] = [
  { id: "threshold", title: "Payments of this much or more need an approver" },
  {
    id: "twoSignoffs",
    title: "Two approvers over $10,000.00",
    help: "Nobody can approve their own request.",
  },
  {
    id: "newRecipients",
    title: "First payment to someone new needs an approver",
    help: "Catches changed bank details and typos.",
  },
  {
    id: "afterHours",
    title: "Hold payments made outside working hours",
    help: "They go out at 9:00 the next working day.",
  },
]

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

const themes: { id: SancusTheme; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "night", label: "Night" },
]

function usdLabel(minor: bigint): string {
  return `$${displayMinor(minor, USDC_DECIMALS, "", 2)}`
}

function parseUsdInput(raw: string): bigint | null {
  return parseToMinor(raw.replace(/[$,\s]/g, ""), USDC_DECIMALS)
}

export default function SettingsPage() {
  const { theme, setTheme } = useSancusPrefs()
  const treasury = useLiveTreasury()
  const live = treasury.summary
  const ws = useWorkspace()

  const [rules, setRules] = useState<Record<RuleId, boolean>>({
    threshold: true,
    twoSignoffs: true,
    newRecipients: true,
    afterHours: false,
  })
  const [threshold, setThreshold] = useState("$1,000.00")
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [railOn, setRailOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rails.map((r) => [r.id, r.on])),
  )

  const policyUrl =
    !ws.isPersonal && ws.companyId
      ? `/api/sancus/companies/${ws.companyId}/policies`
      : "/api/sancus/policies"

  const loadPolicy = useCallback(async () => {
    if (!ws.ready) return
    try {
      const res = await fetch(policyUrl, { cache: "no-store" })
      if (res.status === 401) {
        setStatus("idle")
        return
      }
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Could not load rules")
        setStatus("error")
        return
      }
      const minor = BigInt(body.policy.approvalThresholdMinor)
      const off = minor >= 999_999_999_000_000n
      setRules((prev) => ({ ...prev, threshold: !off }))
      setThreshold(usdLabel(off ? 1_000_000_000n : minor))
      setStatus("idle")
      setError(null)
    } catch {
      setStatus("idle")
    }
  }, [policyUrl, ws.ready])

  useEffect(() => {
    void loadPolicy()
  }, [loadPolicy])

  function setRule(id: RuleId, value: boolean) {
    setRules((prev) => ({ ...prev, [id]: value }))
    setStatus("idle")
  }

  async function saveRules() {
    setStatus("saving")
    setError(null)
    const amount = rules.threshold ? parseUsdInput(threshold) : 999_999_999_000_000n
    if (amount === null || amount <= 0n) {
      setError("Enter a positive dollar amount for the approval rule")
      setStatus("error")
      return
    }
    try {
      const res = await fetch(policyUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalThreshold: formatMinor(amount, USDC_DECIMALS) }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError("save-failed")
        setStatus("error")
        return
      }
      const minor = BigInt(body.policy.approvalThresholdMinor)
      setThreshold(usdLabel(minor >= 999_999_999_000_000n ? 1_000_000_000n : minor))
      setStatus("saved")
    } catch {
      setError("save-failed")
      setStatus("error")
    }
  }

  const ruleRow = {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    padding: "12px 0",
    borderTop: "1px solid var(--line)",
  } as const
  const ruleBody = { flex: 1, display: "grid", gap: 4 } as const

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Settings</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Rules for this account, where you can pay, and how your money is kept.
          </p>
        </div>
      </header>

      <div className="grid">
        <section className="tile s7" aria-labelledby="rules">
          <div className="tile-head">
            <h2 className="tile-title" id="rules">
              Approval rules
            </h2>
            <Link href="/settings/notifications" className="sx-btn sx-btn--quiet">
              Notifications
            </Link>
          </div>
          <p className="body-s muted" style={{ margin: "0 0 8px" }}>
            {!ws.isPersonal && ws.activeNode
              ? `Rules for ${ws.activeNode.name}.`
              : "Rules for your personal account."}
          </p>
          {status === "error" && error === "save-failed" ? (
            <div className="banner banner--err" role="alert">
              <span>
                <b>We couldn&apos;t save your rules.</b> That&apos;s on our side. Your last saved rules still apply.
              </span>
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm" onClick={() => void saveRules()}>
                Try again
              </button>
            </div>
          ) : null}
          {ruleList.map((r) => (
            <div key={r.id} style={ruleRow}>
              <Switch checked={rules[r.id]} label={r.title} onChange={(v) => setRule(r.id, v)} />
              <span style={ruleBody}>
                <span className="body-strong">{r.title}</span>
                {r.id === "threshold" ? (
                  <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      className="sx-field__input"
                      value={threshold}
                      onChange={(e) => {
                        setThreshold(e.target.value)
                        setStatus("idle")
                      }}
                      aria-label="Threshold in USD"
                      disabled={!rules.threshold}
                      style={{ width: 160, fontFamily: "var(--font-mono)" }}
                    />
                    <span className="body-s muted">in USD, at the rate when they ask</span>
                  </span>
                ) : (
                  <span className="body-s muted">{r.help}</span>
                )}
              </span>
            </div>
          ))}
          <div className="tile-foot">
            <span className="body-s muted" role="status">
              {status === "loading"
                ? "Loading your rules…"
                : status === "saving"
                  ? "Saving…"
                  : status === "saved"
                    ? "Saved. Rules apply to requests made from now on."
                    : error && error !== "save-failed"
                      ? error
                      : "The approval amount is saved to your account. Other toggles are still local for the demo."}
            </span>
            <button
              type="button"
              className="sx-btn sx-btn--primary"
              disabled={status === "saving" || status === "loading"}
              onClick={() => void saveRules()}
            >
              Save rules
            </button>
          </div>
        </section>

        <section className="tile s5" aria-labelledby="ws">
          <h2 className="tile-title" id="ws">
            Workspace
          </h2>
          <div className="kv">
            <span>Company</span>
            <span>{workspace.name}</span>
          </div>
          <div className="kv">
            <span>Country</span>
            <span>{workspace.country}</span>
          </div>
          <div className="kv">
            <span>Home currency</span>
            <span>{workspace.homeCurrency}</span>
          </div>
          <div className="kv">
            <span>Balance kept in</span>
            <span>{workspace.balanceCurrency}</span>
          </div>
          <div className="kv">
            <span>Team limits in</span>
            <span>Each person&apos;s currency</span>
          </div>
          <div className="kv">
            <span>Approval rules in</span>
            <span>USD</span>
          </div>
          <div className="kv">
            <span>Theme</span>
            <span>{theme === "night" ? "Night" : "Day"}</span>
          </div>
          <div className="filters" role="group" aria-label="Theme">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="tile-foot">
            <Link href="/branches" className="sx-btn sx-btn--secondary sx-btn--sm">
              Open a business account
            </Link>
          </div>
        </section>

        <section className="tile s12" aria-labelledby="rails">
          <div className="tile-head">
            <h2 className="tile-title" id="rails">
              Where you can pay
            </h2>
            <span className="body-s muted">Rails we route across</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rail</th>
                  <th>Used for</th>
                  <th>Speed</th>
                  <th className="num">Our fee</th>
                  <th>Status</th>
                  <th>On</th>
                </tr>
              </thead>
              <tbody>
                {rails.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="sx-rail">{r.id}</span>
                    </td>
                    <td>{r.usedFor}</td>
                    <td>{r.speed}</td>
                    <td className="num">{r.fee}</td>
                    <td>
                      <span className="body-s">{r.simulated ? "Available" : r.status}</span>
                    </td>
                    <td>
                      <Switch
                        checked={railOn[r.id] ?? false}
                        label={`${r.id} ${railOn[r.id] ? "on" : "off"}`}
                        onChange={(v) => setRailOn((prev) => ({ ...prev, [r.id]: v }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tile-foot">
            <span className="body-s muted">
              Turning a rail off removes it from routing. Payments already on their way still finish.
            </span>
          </div>
        </section>

        <section className="tile s12" aria-labelledby="sec">
          <h2 className="tile-title" id="sec">
            How your money is kept
          </h2>
          <span className="body-s" style={{ maxWidth: "62ch" }}>
            Your balance is held as USDC, issued by Circle, in a treasury contract on Arc.
            Limits, holds and approvals are enforced by that contract. This is the only page that
            names the chain.
          </span>
          <TreasurySetup />
          {live && live.wallets.length > 0 ? (
            live.wallets.map((w) => (
              <div className="kv" key={w.walletId}>
                <span>
                  {w.name || "Wallet"} · {w.blockchain}
                </span>
                <span>
                  <a href={`https://explorer.testnet.arc.io/address/${w.address}`} target="_blank" rel="noreferrer">
                    {w.address.slice(0, 6)}…{w.address.slice(-4)}
                  </a>
                  {" · "}
                  {w.usdcMinor === null ? "balance unavailable" : `$${displayMinor(BigInt(w.usdcMinor), USDC_DECIMALS, "", 2)}`}
                </span>
              </div>
            ))
          ) : (
            <div className="kv">
              <span>Treasury address</span>
              <span>{live ? "No wallets yet: create one in setup" : "0x4F2a…c81E"}</span>
            </div>
          )}
          {live ? (
            <>
              <div className="kv">
                <span>Gateway (unified balance)</span>
                <span>
                  {live.gatewayMinor === null ? "unavailable" : `$${displayMinor(BigInt(live.gatewayMinor), USDC_DECIMALS, "", 2)}`}
                </span>
              </div>
              <div className="kv">
                <span>Ledger</span>
                <span>
                  {live.ledger.inSync ? <StatusPill status="Settled" /> : <StatusPill status="Failed" />}{" "}
                  {live.ledger.inSync ? "In sync with payouts" : "Out of sync"} ·{" "}
                  <a href="/api/sancus/ledger?format=csv">Download CSV</a>
                </span>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  )
}
