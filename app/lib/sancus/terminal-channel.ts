"use client"

// Live link between a payer's phone and a mock vendor terminal (app/terminal/[vendor]).
// Uses Supabase Realtime broadcast (no table, nothing stored) keyed by the terminal reference in the code,
// plus a same-browser BroadcastChannel so the demo still works in two tabs if Realtime is unreachable.

import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"

export type TerminalEvent =
  | {
      type: "processing"
      ref: string
      payerName: string
      sourceLabel: string
      sourceRail: string
    }
  | {
      type: "paid"
      ref: string
      payerName: string
      sourceLabel: string
      sourceRail: string
      payInBank: string
      payoutBank: string
      payoutRail: string
      amountLabel: string
      settlementRef: string
      cardLast4?: string
      live: boolean
      at: string
    }

const topic = (ref: string) => `sancus-terminal-${ref}`

function supabaseOrNull() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null
  try {
    return createClient()
  } catch {
    return null
  }
}

/** Listen for payments on one terminal reference. Returns an unsubscribe function. */
export function subscribeTerminal(ref: string, onEvent: (e: TerminalEvent) => void): () => void {
  const seen = new Set<string>()
  const deliver = (e: TerminalEvent) => {
    if (e?.ref !== ref) return
    const key = `${e.type}:${e.ref}`
    if (seen.has(key)) return
    seen.add(key)
    onEvent(e)
  }
  let local: BroadcastChannel | null = null
  if (typeof BroadcastChannel !== "undefined") {
    local = new BroadcastChannel(topic(ref))
    local.onmessage = (m) => deliver(m.data as TerminalEvent)
  }
  const supabase = supabaseOrNull()
  let channel: RealtimeChannel | null = null
  if (supabase) {
    channel = supabase.channel(topic(ref)).on("broadcast", { event: "terminal" }, ({ payload }) => deliver(payload as TerminalEvent))
    channel.subscribe()
  }
  return () => {
    local?.close()
    if (supabase && channel) void supabase.removeChannel(channel)
  }
}

/** Tell the terminal what's happening. Never throws: the payer's flow doesn't depend on the terminal. */
export async function publishTerminal(e: TerminalEvent): Promise<void> {
  if (typeof BroadcastChannel !== "undefined") {
    const local = new BroadcastChannel(topic(e.ref))
    local.postMessage(e)
    local.close()
  }
  const supabase = supabaseOrNull()
  if (!supabase) return
  const channel = supabase.channel(topic(e.ref))
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000)
      channel.subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return
        await channel.send({ type: "broadcast", event: "terminal", payload: e }).catch(() => null)
        clearTimeout(timer)
        resolve()
      })
    })
  } finally {
    void supabase.removeChannel(channel)
  }
}
