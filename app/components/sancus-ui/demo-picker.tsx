import Link from "next/link"
import { DEMO_LOGIN_PATH } from "@/lib/sancus/demo-login"
import { AuthShell } from "./auth-shell"

type DemoAs = "admin" | "finance" | "branch" | "employee" | "individual"

const OPTIONS: DemoAs[] = ["admin", "finance", "branch", "employee", "individual"]

const COPY: Record<DemoAs, { title: string; detail: string }> = {
  admin: { title: "Business admin", detail: "Owner or admin of the global account. Everything, every branch." },
  finance: { title: "Finance", detail: "Approve payments and transfers for every branch. Can't approve your own." },
  branch: { title: "Branch admin", detail: "Run one branch and its people." },
  employee: { title: "Employee", detail: "Your card, your limits, your agent." },
  individual: { title: "Individual", detail: "A personal dollar account. No business needed." },
}

export function DemoPicker() {
  return (
    <AuthShell
      headEnd={
        <>
          Have an account? <Link href="/sign-in">Sign in</Link>
        </>
      }
    >
      <div aria-labelledby="q" style={{ display: "grid", gap: 20 }}>
        <div className="auth-q">
          <h1 id="q" className="sx-h heading-1">
            Who are you trying the demo as?
          </h1>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {OPTIONS.map((as) => (
            <PortalLink key={as} as={as} />
          ))}
        </div>
      </div>
    </AuthShell>
  )
}

function PortalLink({ as }: { as: DemoAs }) {
  return (
    <a href={`${DEMO_LOGIN_PATH}?as=${as}`} className="pick pick--portal" style={{ width: "100%" }}>
      <span className="pick__copy">
        <span className="body-strong">{COPY[as].title}</span>
        <span className="body-s">{COPY[as].detail}</span>
      </span>
    </a>
  )
}
