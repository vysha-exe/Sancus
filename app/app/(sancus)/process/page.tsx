"use client"

// Process log — settlement activity with on-ramp / off-ramp / local rail steps.
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ProcessDashboard } from "@/components/sancus-ui/process-dashboard"
import { isDevQaEnabled } from "@/lib/sancus/accounts"
import { useAccount } from "@/lib/sancus/use-account"

export default function ProcessPage() {
  const router = useRouter()
  const { account } = useAccount()

  useEffect(() => {
    if (!isDevQaEnabled()) router.replace(account?.homePath ?? "/home")
  }, [account, router])

  if (!isDevQaEnabled()) return null
  return <ProcessDashboard />
}
