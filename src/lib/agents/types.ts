import type { Agent, AgentRun, AgentDraft, AgentStepType, Prisma } from '@prisma/client'

export type { Agent, AgentRun, AgentDraft, AgentStepType }

export type AgentWithRelations = Prisma.AgentGetPayload<{
  include: { runs: { orderBy: { createdAt: 'desc' }; take: 5 } }
}>

export interface DraftCandidate {
  content: string
  platforms: string[]
  tone?: string
  topic?: string
  hashtags?: string[]
  notes?: string
  agentScore?: number
}

export const AGENT_STEP_ORDER: Record<string, number> = {
  PLAN: 0,
  RESEARCH: 1,
  GENERATE: 2,
  REVIEW: 3,
  SCHEDULE: 4,
  PUBLISH: 5,
}
