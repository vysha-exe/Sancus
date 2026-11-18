/** Picker for which demo account to open; demo-login runs after the pick. */
export function demoHref(): string {
  return "/demo"
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
