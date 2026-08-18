import OpenAI from 'openai'

let client: OpenAI | null = null

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!client) client = new OpenAI({ apiKey })
  return client
}

export interface ChatCall {
  system: string
  user: string
  model?: string
  temperature?: number
  json?: boolean
}

export interface ChatResult {
  text: string
  tokensUsed: number
  model: string
}

/**
 * Call the chat model. Returns null-friendly result; if no API key is configured
 * the engine falls back to deterministic templates so the platform still runs.
 */
export async function chat(call: ChatCall): Promise<ChatResult | null> {
  const c = getClient()
  const model = call.model || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  if (!c) return null
  try {
    const completion = await c.chat.completions.create({
      model,
      temperature: call.temperature ?? 0.7,
      messages: [
        { role: 'system', content: call.system },
        { role: 'user', content: call.user },
      ],
      ...(call.json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    return {
      text: completion.choices[0]?.message?.content ?? '',
      tokensUsed: completion.usage?.total_tokens ?? 0,
      model,
    }
  } catch (err) {
    console.error('[agents] LLM call failed:', (err as Error).message)
    return null
  }
}
