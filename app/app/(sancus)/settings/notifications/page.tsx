"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  CATEGORY_LABEL,
  DEFAULT_PREFS,
  readPrefs,
  writePrefs,
  type ChannelPrefs,
  type NotificationPrefs,
  type NtfCategory,
} from "@/lib/sancus/notifications"

const CATEGORIES = Object.keys(DEFAULT_PREFS) as NtfCategory[]
const LOCKED: Partial<Record<NtfCategory, keyof ChannelPrefs>> = {
  security: "inApp",
  payments: "inApp",
}

export default function SettingsNotificationsPage() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPrefs(readPrefs())
  }, [])

  function setChannel(cat: NtfCategory, channel: keyof ChannelPrefs, value: boolean) {
    if (LOCKED[cat] === channel && !value) return
    setPrefs((prev) => {
      const next = { ...prev, [cat]: { ...prev[cat], [channel]: value } }
      writePrefs(next)
      return next
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="body-s muted">
            <Link href="/settings">Settings</Link> / Notifications
          </nav>
          <h1 className="sx-h heading-2">Notification preferences</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Choose what reaches you in the app, by email, or on your phone. Security alerts stay on.
          </p>
        </div>
      </header>

      {saved ? (
        <p className="body-s" role="status" style={{ marginBottom: 12 }}>
          Saved on this device.
        </p>
      ) : null}

      <section className="tile s12" aria-labelledby="prefs">
        <h2 className="tile-title" id="prefs">
          By category
        </h2>
        <div className="tbl-wrap">
          <table className="tbl ntf-prefs">
            <thead>
              <tr>
                <th>Category</th>
                <th>In app</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => (
                <tr key={cat}>
                  <td>
                    <b>{CATEGORY_LABEL[cat]}</b>
                    {LOCKED[cat] ? (
                      <span className="body-s muted"> · locked on for {LOCKED[cat]}</span>
                    ) : null}
                  </td>
                  {(["inApp", "email", "push"] as const).map((ch) => (
                    <td key={ch}>
                      <input
                        type="checkbox"
                        checked={prefs[cat][ch]}
                        disabled={LOCKED[cat] === ch}
                        aria-label={`${CATEGORY_LABEL[cat]} ${ch}`}
                        onChange={(e) => setChannel(cat, ch, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="tile-foot">
          <span className="body-s muted">
            Quiet hours and digests are planned; prefs here are stored locally for the demo.
          </span>
        </div>
      </section>
    </div>
  )
}
