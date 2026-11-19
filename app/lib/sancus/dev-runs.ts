import type { SupabaseClient } from "@supabase/supabase-js"

export type DevRunStatus = "RUNNING" | "WAITING" | "PASSED" | "FAILED"
export type DevRunStep = { key: string; ok: boolean; detail: string; at: string }

export function step(key: string, ok: boolean, detail: string): DevRunStep {
  return { key, ok, detail, at: new Date().toISOString() }
}

export async function createDevRun(supabase: SupabaseClient, input: {
  userId: string
  companyId?: string | null
  runType: string
  provider: string
  steps?: DevRunStep[]
}) {
  const { data, error } = await supabase.from("sancus_dev_runs").insert({
    user_id: input.userId,
    company_id: input.companyId ?? null,
    run_type: input.runType,
    provider: input.provider,
    steps: input.steps ?? [],
  }).select("*").single()
  if (error || !data) throw new Error(error?.message || "Could not create the Dev run")
  return data
}

export async function finishDevRun(supabase: SupabaseClient, id: string, input: {
  status: DevRunStatus
  steps: DevRunStep[]
  sourceRecordType?: string
  sourceRecordId?: string
  providerRef?: string
  error?: string | null
}) {
  await supabase.from("sancus_dev_runs").update({
    status: input.status,
    steps: input.steps,
    source_record_type: input.sourceRecordType ?? null,
    source_record_id: input.sourceRecordId ?? null,
    provider_ref: input.providerRef ?? null,
    error: input.error ?? null,
    completed_at: input.status === "WAITING" || input.status === "RUNNING" ? null : new Date().toISOString(),
  }).eq("id", id)
}

export function workflow(steps: DevRunStep[]) {
  return Object.fromEntries(steps.map((item) => [item.key, { ok: item.ok, detail: item.detail }]))
}

export function sanitizeProviderPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProviderPayload)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    /secret|password|access.?token|card.?token|\bpan\b|cvv|\bpin\b/i.test(key) ? "[REDACTED]" : sanitizeProviderPayload(item),
  ]))
}
