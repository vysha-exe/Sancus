// OpenAI chat + tools loop for the Sancus agent (replaces Anthropic toolRunner for testing).
import { z } from "zod/v4"
import type { AgentTool } from "./tools"

const MODEL = () => process.env.OPENAI_AGENT_MODEL?.trim() || "gpt-4o"

export function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  // OpenAI wants a plain object schema, not draft metadata.
  const { $schema: _s, ...rest } = json
  return rest.type === "object" ? rest : { type: "object", properties: {}, additionalProperties: false }
}

export function toOpenAiTools(tools: AgentTool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: toParameters(t.schema),
    },
  }))
}

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

type ToolCall = {
  id: string
  type: "function"
  function: { name: string; arguments: string }
}

type ChatResponse = {
  choices?: { message?: { role: string; content?: string | null; tool_calls?: ToolCall[] }; finish_reason?: string }[]
  error?: { message?: string }
}

export async function runOpenAiAgent(input: {
  system: string
  messages: { role: "user" | "assistant"; content: string }[]
  tools: AgentTool[]
  maxIterations?: number
}): Promise<{ reply: string }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error("OPENAI_API_KEY is not set")

  const byName = new Map(input.tools.map((t) => [t.name, t]))
  const openaiTools = toOpenAiTools(input.tools)
  const messages: ChatMessage[] = [{ role: "system", content: input.system }, ...input.messages]
  const maxIterations = input.maxIterations ?? 12

  for (let i = 0; i < maxIterations; i++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL(),
        messages,
        tools: openaiTools.length ? openaiTools : undefined,
        tool_choice: openaiTools.length ? "auto" : undefined,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(90_000),
    })
    const body = (await res.json()) as ChatResponse
    if (!res.ok) {
      const msg = body.error?.message || `OpenAI ${res.status}`
      const err = new Error(msg) as Error & { status?: number }
      err.status = res.status
      throw err
    }
    const message = body.choices?.[0]?.message
    if (!message) throw new Error("OpenAI returned an empty response")

    const toolCalls = message.tool_calls ?? []
    if (toolCalls.length === 0) {
      return { reply: (message.content ?? "").trim() || "Done." }
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    })

    for (const call of toolCalls) {
      const tool = byName.get(call.function.name)
      let result: string
      if (!tool) {
        result = `Unknown tool: ${call.function.name}`
      } else {
        let args: unknown = {}
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
        } catch {
          result = "Invalid tool arguments JSON"
          messages.push({ role: "tool", tool_call_id: call.id, content: result })
          continue
        }
        const parsed = tool.schema.safeParse(args)
        if (!parsed.success) {
          result = `Invalid tool input: ${parsed.error.issues.map((x) => x.message).join("; ")}`
        } else {
          result = await tool.run(parsed.data)
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result })
    }
  }

  return { reply: "I ran out of steps before finishing. Try a shorter request." }
}

export function openaiModelName() {
  return MODEL()
}
