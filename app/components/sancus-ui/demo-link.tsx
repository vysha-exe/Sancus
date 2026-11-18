import { DEMO_LOGIN_PATH, isDemoLoginEnabled } from "@/lib/sancus/demo-login"

const DEMO_HREF = `${DEMO_LOGIN_PATH}?next=${encodeURIComponent("/home")}`

/** Full navigation into demo login (so Set-Cookie sticks) when enabled; else /home. */
export function demoHref(): string {
  return isDemoLoginEnabled() ? DEMO_HREF : "/home"
}

export function DemoLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <a href={demoHref()} className={className}>
      {children}
    </a>
  )
}
