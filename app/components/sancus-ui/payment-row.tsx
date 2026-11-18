import Link from "next/link"
import type { Payment } from "@/lib/sancus/demo-data"
import { StatusPill } from "./status-pill"

export function PaymentRow({ payment }: { payment: Payment }) {
  const inner = (
    <>
      <span className="sx-row__who">{payment.who}</span>
      <span className={`sx-row__amount${payment.amountIn ? " sx-row__amount--in" : ""}`}>
        {payment.amount}
      </span>
      <span className="sx-row__meta">
        <span className="sx-rail">{payment.rail}</span>
        {payment.meta}
      </span>
      <span className="sx-row__status pills">
        <StatusPill status={payment.status} />
      </span>
    </>
  )

  if (payment.href) {
    return (
      <Link href={payment.href} className="sx-row">
        {inner}
      </Link>
    )
  }

  return <div className="sx-row">{inner}</div>
}
