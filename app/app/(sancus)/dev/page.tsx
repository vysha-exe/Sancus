"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { DevQaDashboard } from "@/components/sancus-ui/dev-qa-dashboard"
import { isDevQaEnabled } from "@/lib/sancus/accounts"
import { useAccount } from "@/lib/sancus/use-account"

export default function DevPage() {
  const router = useRouter()
  const { account } = useAccount()

  useEffect(() => {
    if (!isDevQaEnabled()) router.replace(account?.homePath ?? "/home")
  }, [account, router])

  if (!isDevQaEnabled()) return null
  return <DevQaDashboard />
}
