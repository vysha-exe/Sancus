"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  CATEGORY_LABEL,
  type NotificationDto,
} from "@/lib/sancus/notifications"
import { IconBell } from "./icons"

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

type Filter = "all" | "action" | "alert"

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const [items, setItems] = useState<NotificationDto[]>([])
  const [unread, setUnread] = useState(0)
  const [needsYou, setNeedsYou] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f: Filter = filter) => {
    try {
      const q = f === "all" ? "" : `?filter=${f === "action" ? "action" : "alert"}`
      const res = await fetch(`/api/sancus/notifications${q}`, { cache: "no-store" })
      if (!res.ok) {
        setItems([])
        setUnread(0)
        return
      }
      const body = await res.json()
      setItems(body.notifications ?? [])
      setUnread(body.unread ?? 0)
      setNeedsYou(body.needsYou ?? 0)
    } catch {
      setItems([])
    }
  }, [filter])

  useEffect(() => {
    // Defer the first poll slightly so home/approvals/companies compile+fetch first.
    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined
    const start = window.setTimeout(() => {
      if (cancelled) return
      void load("all")
      interval = setInterval(() => void load(filter), 60_000)
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(start)
      if (interval) clearInterval(interval)
    }
  }, [load, filter])

  useEffect(() => {
    if (!open) return
    void load(filter)
  }, [open, filter, load])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  async function markAll() {
    await fetch("/api/sancus/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read_all" }),
    })
    void load(filter)
  }

  async function openItem(n: NotificationDto) {
    if (!n.readAt) {
      await fetch(`/api/sancus/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      })
    }
    setOpen(false)
  }

  const actionItems = items.filter((n) => n.priority === "action" && !n.resolvedAt)
  const otherItems = items.filter((n) => !(n.priority === "action" && !n.resolvedAt))

  return (
    <div className="bell" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
        {unread > 0 ? <b /> : null}
      </button>
      {open ? (
        <div className="menu menu--end ntf-menu" role="menu" aria-label="Notifications">
          <div className="ntf-head">
            <b>Notifications</b>
            <button type="button" className="sx-btn sx-btn--quiet" onClick={() => void markAll()}>
              Mark all read
            </button>
          </div>
          <div className="filters" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["action", `Needs you${needsYou ? ` · ${needsYou}` : ""}`],
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
          <div className="ntf-list">
            {items.length === 0 ? (
              <p className="body-s muted" style={{ padding: "16px 12px", margin: 0 }}>
                Nothing here yet. Invites, approvals and money-in will show up here.
              </p>
            ) : (
              <>
                {filter === "all" && actionItems.length > 0 ? (
                  <span className="sx-label">Needs you · {actionItems.length}</span>
                ) : null}
                {(filter === "all" ? actionItems : items.filter((n) => n.priority === "action")).map((n) => (
                  <NtfRow key={n.id} n={n} onOpen={openItem} />
                ))}
                {filter === "all" && otherItems.length > 0 ? <span className="sx-label">Earlier</span> : null}
                {filter === "all"
                  ? otherItems.map((n) => <NtfRow key={n.id} n={n} onOpen={openItem} />)
                  : filter !== "action"
                    ? items.map((n) => <NtfRow key={n.id} n={n} onOpen={openItem} />)
                    : null}
              </>
            )}
          </div>
          <div className="ntf-foot">
            <Link href="/notifications" className="sx-btn sx-btn--quiet" onClick={() => setOpen(false)}>
              See all
            </Link>
            <Link href="/settings/notifications" className="sx-btn sx-btn--quiet" onClick={() => setOpen(false)}>
              Settings
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NtfRow({ n, onOpen }: { n: NotificationDto; onOpen: (n: NotificationDto) => void }) {
  const cls = [
    "ntf",
    !n.readAt ? "ntf--new" : "",
    n.priority === "action" ? "ntf--act" : "",
    n.priority === "alert" ? "ntf--alert" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const inner = (
    <>
      <i aria-hidden="true" />
      <span className="ntf-txt">
        <span className="ntf-m">
          <span className="ntf-kind">{CATEGORY_LABEL[n.category]}</span>
        </span>
        <span className="ntf-t">{n.title}</span>
        {n.body ? <span className="ntf-m">{n.body}</span> : null}
      </span>
      <span className="ntf-side">
        <span className="ntf-time">{timeLabel(n.createdAt)}</span>
      </span>
    </>
  )
  if (n.link) {
    return (
      <Link href={n.link} className={cls} role="menuitem" onClick={() => void onOpen(n)}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" className={cls} role="menuitem" onClick={() => void onOpen(n)} style={{ width: "100%", textAlign: "left", font: "inherit", border: 0, background: "transparent", cursor: "pointer" }}>
      {inner}
    </button>
  )
}
