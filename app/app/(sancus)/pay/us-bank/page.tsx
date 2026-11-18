import Link from "next/link"
import { AchPayout } from "@/components/sancus-ui/ach-payout"

export default function PayUsBankPage() {
  return (
    <div className="page">
      <header className="page-head">
        <div style={{ display: "grid", gap: 6 }}>
          <Link href="/pay" className="sx-btn sx-btn--quiet" style={{ justifySelf: "start" }}>
            ← Pay
          </Link>
          <h1 className="sx-h heading-2">Pay a US bank account</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            USDC from your Treasury becomes USD at 1:1 and lands by ACH. The bank leg is simulated.
          </p>
        </div>
      </header>
      <AchPayout />
    </div>
  )
}
