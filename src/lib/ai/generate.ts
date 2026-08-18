import OpenAI from 'openai'
import { AppError } from '@/lib/teams/rbac'

let client: OpenAI | null = null

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw AppError.badRequest('OPENAI_API_KEY not configured')
  if (!client) {
    client = new OpenAI({ apiKey })
  }
  return client
}

const SYSTEM = 'You are an expert social media copywriter. Write concise, engaging, on-brand posts.'

/**
 * Generate N post variants from a prompt.
 */
export async function generatePostVariants(prompt: string, count = 3): Promise<string[]> {
  const openai = getClient()
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.8,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Generate ${count} distinct social media post variants based on this brief. Return ONLY a JSON array of strings, no markdown:\n\n${prompt}`,
      },
    ],
    response_format: { type: 'json_object' },
  })

  const content = completion.choices[0]?.message?.content || '{"variants":[]}'
  try {
    const parsed = JSON.parse(content)
    const variants = Array.isArray(parsed) ? parsed : parsed.variants
    return (variants as string[]).slice(0, count)
  } catch {
    return [content]
  }
}

/**
 * Improve / rewrite existing copy.
 */
export async function improvePost(text: string): Promise<string> {
  const openai = getClient()
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Improve the following post for clarity, engagement, and correctness. Keep the meaning. Return only the improved text:\n\n${text}`,
      },
    ],
  })
  return completion.choices[0]?.message?.content?.trim() || text
}

/**
 * Generate relevant hashtags for a piece of text.
 */
export async function generateHashtags(text: string): Promise<string[]> {
  const openai = getClient()
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You suggest relevant, non-spammy hashtags for social posts.' },
      {
        role: 'user',
        content: `Given this post, return a JSON array of 5-10 hashtags (without the # in the array, but include # when you can). Post:\n\n${text}`,
      },
    ],
    response_format: { type: 'json_object' },
  })
  const content = completion.choices[0]?.message?.content || '{"hashtags":[]}'
  try {
    const parsed = JSON.parse(content)
    const tags = Array.isArray(parsed) ? parsed : parsed.hashtags
    return (tags as string[]).slice(0, 10)
  } catch {
    return []
  }
}
