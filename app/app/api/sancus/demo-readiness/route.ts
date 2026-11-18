import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import { demoFallbacksEnabled } from "@/lib/sancus/demo-fallback"
import { isMarqetaConfigured } from "@/lib/sancus/rails/marqeta"
import { isPayZuConfigured } from "@/lib/sancus/rails/payzu"

export const GET = withAuth(async () => {
  const fallback = demoFallbacksEnabled()
  const marqeta = isMarqetaConfigured()
  const payzu = isPayZuConfigured()
  return NextResponse.json({
    fallback,
    providers: { marqeta, payzu },
    stageReady: marqeta && payzu && !fallback,
  })
})
