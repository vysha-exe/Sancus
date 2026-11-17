"use client"

import { useState } from "react"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { rails, workspace } from "@/lib/sancus/demo-data"
import { useSancusPrefs, type SancusTheme } from "@/lib/sancus/prefs"

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

export default function SettingsPage() {
  const { theme, setTheme } = useSancusPrefs()

  const [rules, setRules] = useState<Record<RuleId, boolean>>({
    threshold: true,
    twoSignoffs: true,
    newRecipients: true,
    afterHours: false,
  })
  const [threshold, setThreshold] = useState("$1,000.00")
  const [saved, setSaved] = useState(false)
  const [railOn, setRailOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rails.map((r) => [r.id, r.on])),
  )

  function setRule(id: RuleId, value: boolean) {
    setRules((prev) => ({ ...prev, [id]: value }))
    setSaved(false)
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
          <h2 className="tile-title" id="rules">
            Approval rules
          </h2>
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
                        setSaved(false)
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
              {saved ? "Saved. Rules apply to requests made from now on." : "Rules apply to requests made after you save."}
            </span>
            <button type="button" className="sx-btn sx-btn--primary" onClick={() => setSaved(true)}>
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
            <span className="sx-pill sx-pill--simulated">Demo workspace</span>
            <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
              Switch workspace
            </button>
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
                      {r.simulated ? (
                        <StatusPill status="Simulated" />
                      ) : (
                        <span className="body-s">{r.status}</span>
                      )}
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
            Your balance is held as USDC, issued by Circle, in a treasury contract on Arc testnet.
            Limits, holds and approvals are enforced by that contract. This is the only page that
            names the chain.
          </span>
          <div className="kv">
            <span>Treasury address</span>
            <span>0x4F2a…c81E</span>
          </div>
        </section>
      </div>
    </div>
  )
}
