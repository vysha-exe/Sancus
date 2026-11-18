"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { CATEGORY_LABEL, type NotificationDto } from "@/lib/sancus/notifications"

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationDto[]>([])
  const [filter, setFilter] = useState<"all" | "action" | "alert">("all")
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = filter === "all" ? "" : `?filter=${filter}`
      const res = await fetch(`/api/sancus/notifications${q}`, { cache: "no-store" })
      if (!res.ok) {
        setItems([])
        return
      }
      const body = await res.json()
      setItems(body.notifications ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Notifications</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Approvals, money in, team and security for this account.
          </p>
        </div>
        <Link href="/settings/notifications" className="sx-btn sx-btn--secondary">
          Preferences
        </Link>
      </header>

      <div className="filters" role="group" aria-label="Show" style={{ marginBottom: 16 }}>
        {(
          [
            ["all", "All"],
            ["action", "Needs you"],
            ["alert", "Alerts"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="chip"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="tile s12">
        <div className="ntf-list ntf-list--page">
          {loading ? (
            <p className="body-s muted">Loading…</p>
          ) : items.length === 0 ? (
            <div className="empty">
              <b style={{ color: "var(--ink)" }}>No notifications</b>
              <span>Invites, approvals and money-in land here.</span>
            </div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/home"}
                className={`ntf ntf--row${!n.readAt ? " ntf--new" : ""}${n.priority === "action" ? " ntf--act" : ""}${n.priority === "alert" ? " ntf--alert" : ""}`}
                onClick={() => {
                  if (!n.readAt) {
                    void fetch(`/api/sancus/notifications/${n.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ read: true }),
                    })
                  }
                }}
              >
                <i aria-hidden="true" />
                <span className="ntf-txt">
                  <span className="ntf-m">
                    <span className="ntf-kind">{CATEGORY_LABEL[n.category]}</span>
                  </span>
                  <span className="ntf-t">{n.title}</span>
                  {n.body ? <span className="ntf-m">{n.body}</span> : null}
                </span>
                <span className="ntf-side">
                  <span className="ntf-time">
                    {new Date(n.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
