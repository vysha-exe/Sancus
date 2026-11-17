import Link from "next/link"
import { StatusPill } from "@/components/sancus-ui/status-pill"
import { getPerson } from "@/lib/sancus/demo-data"

const roleAccess: Record<string, { pay: string; approve: string }> = {
  Owner: { pay: "Yes, no limit", approve: "Yes" },
  Finance: { pay: "Yes, in limits", approve: "Yes, up to $5,000.00" },
  Employee: { pay: "Yes, in limits", approve: "No" },
  Viewer: { pay: "No", approve: "No" },
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ personId: string }>
}) {
  const { personId } = await params
  const person = getPerson(personId)

  if (!person) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="sx-h heading-2">We couldn&apos;t find that person</h1>
            <p className="body-s muted" style={{ margin: 0 }}>
              They may have been removed, or the link is out of date.
            </p>
          </div>
        </header>
        <div>
          <Link href="/team" className="sx-btn sx-btn--primary">
            Back to Team
          </Link>
        </div>
      </div>
    )
  }

  const first = person.name.split(" ")[0]
  const isAna = person.id === "ana"
  const canSpend = person.role === "Employee" || person.role === "Finance"
  const access = roleAccess[person.role] ?? { pay: "No", approve: "No" }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="body-s muted">
            <Link href="/team">Team</Link> / {person.name}
          </nav>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <span className="av av--lg">{person.initials}</span>
            <div style={{ display: "grid", gap: 2 }}>
              <h1 className="sx-h heading-2">{person.name}</h1>
              <span className="body-s muted">
                {person.role} · {isAna ? "São Paulo, Brazil" : person.country}
                {isAna ? " · ana@cafepaulista.com.br" : ""}
              </span>
            </div>
          </div>
        </div>
        {canSpend ? (
          <Link href={`/team/${person.id}/methods/new`} className="sx-btn sx-btn--primary">
            Add a card or QR
          </Link>
        ) : null}
      </header>

      {isAna ? (
        <div className="grid">
          <section className="tile s4" aria-labelledby="lim">
            <div className="tile-head">
              <h2 className="tile-title" id="lim">
                Limits
              </h2>
              <button type="button" className="sx-btn sx-btn--quiet">
                Edit
              </button>
            </div>
            <div className="kv">
              <span>Per payment (approval rule)</span>
              <span>$500.00</span>
            </div>
            <div className="kv">
              <span>Monthly budget</span>
              <span>R$ 8.000,00</span>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div className="kv">
                <span>Used this month</span>
                <span>R$ 595,35</span>
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-valuenow={7}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="7% of monthly budget used"
              >
                <i style={{ width: "7%" }} />
              </div>
            </div>
            <div className="kv">
              <span>Approved by</span>
              <span>Rafael or Maya</span>
            </div>
            <div className="tile-foot">
              <span className="body-s muted">Budget covers every card and QR she has.</span>
            </div>
          </section>

          <section className="tile s8" aria-labelledby="methods">
            <div className="tile-head">
              <h2 className="tile-title" id="methods">
                Cards and QR
              </h2>
              <span className="body-s muted">2 active</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Where</th>
                    <th className="num">Monthly limit</th>
                    <th className="num">Used</th>
                    <th>State</th>
                    <th>
                      <span className="vh">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="sx-rail">Card</span> Office and supplies ••4021
                    </td>
                    <td>Anywhere cards work</td>
                    <td className="num">R$ 2.700,00</td>
                    <td className="num">R$ 541,23</td>
                    <td className="body-s">Active · $398.86 held</td>
                    <td>
                      <Link href="/spending" className="sx-btn sx-btn--quiet" aria-label="Manage card 4021">
                        Manage
                      </Link>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="sx-rail">Pix QR</span> Market runs
                    </td>
                    <td>Brazil</td>
                    <td className="num">R$ 800,00</td>
                    <td className="num">R$ 54,12</td>
                    <td className="body-s">Active · not held</td>
                    <td>
                      <Link href="/spending" className="sx-btn sx-btn--quiet" aria-label="Manage Pix QR">
                        Manage
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="tile-foot">
              <span className="body-s muted">
                The two limits can add up to more than her budget. The budget wins.
              </span>
            </div>
          </section>

          <section className="tile s8" aria-labelledby="act">
            <div className="tile-head">
              <h2 className="tile-title" id="act">
                Ana&apos;s activity
              </h2>
              <Link href="/activity" className="sx-btn sx-btn--quiet">
                See all
              </Link>
            </div>
            <div className="sx-rows">
              <Link href="/activity/approvals" className="sx-row">
                <span className="sx-row__who">Gráfica Aurora · asked you to approve</span>
                <span className="sx-row__amount">$592.05</span>
                <span className="sx-row__meta">
                  <span className="sx-rail">Pix</span>R$ 3.200,00 · Today, 8:05
                </span>
                <span className="sx-row__status">
                  <StatusPill status="Pending" />
                </span>
              </Link>
              <Link href="/activity" className="sx-row">
                <span className="sx-row__who">Padaria Bela Vista</span>
                <span className="sx-row__amount">−$10.00</span>
                <span className="sx-row__meta">
                  <span className="sx-rail">Pix QR</span>R$ 54,12 · Today, 10:02
                </span>
                <span className="sx-row__status pills">
                  <StatusPill status="Simulated" />
                  <StatusPill status="Settled" />
                </span>
              </Link>
              <Link href="/activity" className="sx-row">
                <span className="sx-row__who">Papelaria Central</span>
                <span className="sx-row__amount">−$100.00</span>
                <span className="sx-row__meta">
                  <span className="sx-rail">Card</span>Today, 9:12
                </span>
                <span className="sx-row__status pills">
                  <StatusPill status="Simulated" />
                  <StatusPill status="Settled" />
                </span>
              </Link>
            </div>
          </section>

          <section className="tile s4" aria-labelledby="acc">
            <h2 className="tile-title" id="acc">
              Access
            </h2>
            <div className="kv">
              <span>Can pay people</span>
              <span>Yes, in limits</span>
            </div>
            <div className="kv">
              <span>Can approve</span>
              <span>No</span>
            </div>
            <div className="kv">
              <span>Joined</span>
              <span>Nov 13</span>
            </div>
            <div className="tile-foot">
              <button type="button" className="sx-btn sx-btn--secondary sx-btn--sm">
                Pause everything
              </button>
              <button type="button" className="sx-btn sx-btn--quiet">
                Remove Ana
              </button>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid">
          <section className="tile s6" aria-labelledby="lim">
            <h2 className="tile-title" id="lim">
              Limits and methods
            </h2>
            <div className="kv">
              <span>Spends with</span>
              <span>{person.method}</span>
            </div>
            <div className="kv">
              <span>Monthly limit</span>
              <span>{person.limit}</span>
            </div>
            {person.status ? (
              <div className="kv">
                <span>State</span>
                <span>{person.status}</span>
              </div>
            ) : null}
            <div className="tile-foot">
              <span className="body-s muted">
                {canSpend
                  ? `${first} spends from your balance, up to this limit.`
                  : `${first} can't spend from this account.`}
              </span>
            </div>
          </section>

          <section className="tile s6" aria-labelledby="acc">
            <h2 className="tile-title" id="acc">
              Access
            </h2>
            <div className="kv">
              <span>Role</span>
              <span>{person.role}</span>
            </div>
            <div className="kv">
              <span>Can pay people</span>
              <span>{access.pay}</span>
            </div>
            <div className="kv">
              <span>Can approve</span>
              <span>{access.approve}</span>
            </div>
            <div className="tile-foot">
              <Link href="/team" className="sx-btn sx-btn--quiet">
                Back to Team
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
