"use client"

// Legacy path — Process replaced the Dev QA API smoke tests.
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function DevQaRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/process")
  }, [router])
  return null
}
