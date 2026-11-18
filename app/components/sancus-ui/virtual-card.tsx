import type { CSSProperties } from "react"
import { RisingColumn } from "./logo"

/** Decorative virtual card used on the marketing site. Matches the sx-card markup in the wireframes. */
export function VirtualCard({
  limit,
  name,
  num,
  mark = false,
  className,
  style,
  ariaLabel,
}: {
  limit: string
  name: string
  num: string
  mark?: boolean
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}) {
  return (
    <div
      className={className ? `sx-card ${className}` : "sx-card"}
      style={style}
      {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : {})}
    >
      {mark ? <RisingColumn className="sx-card__mark" /> : null}
      <div className="sx-card__top">
        <span className="sx-card__brand">
          <RisingColumn />
          SANCUS
        </span>
        <span className="sx-card__limit">LIMIT {limit}</span>
      </div>
      <div />
      <div className="sx-card__foot">
        <span style={{ display: "grid", gap: 4 }}>
          <span style={{ opacity: 0.8 }}>{name}</span>
          <span className="sx-card__num">{num}</span>
        </span>
        <span style={{ opacity: 0.8 }}>VIRTUAL</span>
      </div>
    </div>
  )
}

/** Check-mark list used in the Pay and Spend feature sections. */
export function Ticks({ items }: { items: string[] }) {
  return (
    <ul className="ticks">
      {items.map((t) => (
        <li key={t}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
