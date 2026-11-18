"use client"

import { AgentActivity, AgentConsole, AgentWalletTile } from "@/components/sancus-ui/agent-console"
import { X402Earnings } from "@/components/sancus-ui/x402-earnings"

export default function AgentsPage() {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="sx-h heading-2">Agents</h1>
          <p className="body-s muted" style={{ margin: 0 }}>
            Tell Sancus what you want done and it does it: checks balances, gets live quotes, pays for data with x402
            micropayments, and prepares payments for you to confirm. Other agents can pay you for your data too.
          </p>
        </div>
      </header>

      <div className="grid">
        <AgentConsole />
        <AgentWalletTile />
        <X402Earnings />
        <AgentActivity />
      </div>
    </div>
  )
}
