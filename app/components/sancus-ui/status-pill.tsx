import type { Status } from "@/lib/sancus/demo-data"

const statusClass: Record<Status | "Simulated" | "Approval" | "Due", string> = {
  Settled: "sx-pill sx-pill--settled",
  Pending: "sx-pill sx-pill--pending",
  Held: "sx-pill sx-pill--held",
  Failed: "sx-pill sx-pill--failed",
  Simulated: "sx-pill sx-pill--simulated",
  Approval: "sx-pill sx-pill--pending",
  Due: "sx-pill sx-pill--pending",
}

export function StatusPill({
  status,
}: {
  status: Status | "Simulated" | "Approval" | "Due"
}) {
  return <span className={statusClass[status]}>{status}</span>
}
