import type { Agent } from '@prisma/client'

export function systemForAgent(agent: Agent): string {
  return `You are "${agent.name}", an autonomous social media content agent.
Objective: ${agent.goal}
Tone: ${agent.tone}
Platforms: ${agent.platforms.join(', ')}
${agent.topics.length ? `Preferred topics: ${agent.topics.join(', ')}` : ''}
${agent.hashtags.length ? `Signature hashtags: ${agent.hashtags.join(' ')}` : ''}

You operate as part of a human-in-the-loop system. Produce high-quality, platform-appropriate,
non-spammy content. Never invent statistics. Be concise and engaging.`
}

export const PLANNER_PROMPT = `Given the agent's objective, decide ONE concrete content idea to produce next.
Return JSON: {"topics":[...], "angle": "...", "cadenceNote": "..."}.`

export const RESEARCHER_PROMPT = `You are researching the chosen angle to add credible, accurate context.
Return JSON: {"insights":["..."], "sources":["..."]}. Do not fabricate sources.`

export const WRITER_PROMPT = `Write the post(s) for the planned angle using the research insights.
Match the agent's tone and platform constraints. Return JSON:
{"variants":[{"content":"...","platforms":["X"],"topic":"...","hashtags":["..."]}]}.`

export const REVIEWER_PROMPT = `Review the candidate post for quality, brand fit, accuracy, and spamminess.
Return JSON: {"score":0-100,"notes":"...","approved":true|false}.`
