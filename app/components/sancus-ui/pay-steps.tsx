import Link from "next/link"
import { IconBack } from "./icons"

const steps = [
  { n: 1, label: "Who", href: "/pay" },
  { n: 2, label: "How much", href: "/pay/amount" },
  { n: 3, label: "Review", href: "/pay/review" },
  { n: 4, label: "Done", href: "/pay/done" },
] as const

export function PayFlowHead({
  title,
  step,
  backHref,
}: {
  title: string
  step: 1 | 2 | 3 | 4
  backHref?: string
}) {
  return (
    <header className="page-head flowhead">
      <div className="title">
        {backHref ? (
          <Link href={backHref} className="icon-btn" aria-label="Back">
            <IconBack />
          </Link>
        ) : null}
        <h1 className="sx-h heading-2">{title}</h1>
      </div>
      <ol className="steps" aria-label="Payment steps">
        {steps.map((s) => (
          <li
            key={s.n}
            aria-current={s.n === step ? "step" : undefined}
            className={s.n < step ? "done" : undefined}
          >
            {s.n} · {s.label}
          </li>
        ))}
      </ol>
    </header>
  )
}
