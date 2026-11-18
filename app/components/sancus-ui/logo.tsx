import Link from "next/link"

export function RisingColumn({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect x="7" y="9" width="50" height="8.5" rx="1.5" fill="currentColor" />
      <rect x="12" y="20" width="40" height="3.6" rx=".6" fill="currentColor" />
      <rect x="13.2" y="27.5" width="4.6" height="12.5" rx="1" fill="currentColor" />
      <rect x="21.45" y="27.5" width="4.6" height="18.5" rx="1" fill="currentColor" />
      <path
        d="M32 27.5 C 26.5 31.5 37.5 35.5 32 39.5 L32 50"
        stroke="currentColor"
        strokeWidth="4.6"
        fill="none"
      />
      <rect x="37.95" y="27.5" width="4.6" height="26.5" rx="1" fill="currentColor" />
      <rect x="46.2" y="27.5" width="4.6" height="31.5" rx="1" fill="currentColor" />
    </svg>
  )
}

export function SancusLockup({ href = "/", className = "sx-lockup sx-wordmark brand" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={className} aria-label="Sancus, back to the home page">
      <RisingColumn />
      <span className="lbl">SANCUS</span>
    </Link>
  )
}
