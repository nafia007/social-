import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { chat } from './llm'
import { getMemories, addMemory } from './memory'
import { hashtagTool, scoreTool, fallbackGenerate } from './tools'
import {
  systemForAgent,
  PLANNER_PROMPT,
  RESEARCHER_PROMPT,
  WRITER_PROMPT,
  REVIEWER_PROMPT,
} from './prompts'
import type { Agent, AgentRun, AgentStepType, DraftCandidate } from './types'

interface StepHandle {
  complete: (output: unknown, extra?: { tokensUsed?: number; model?: string }) => Promise<void>
  fail: (error: string) => Promise<void>
}

/**
 * Execute one agent run end-to-end:
 *   PLAN → RESEARCH → GENERATE → REVIEW → (draft) → [SCHEDULE/PUBLISH if autoPublish]
 * Human approval is the default gate; autoPublish bypasses it per agent policy.
 */
export async function executeRun(agentId: string, scheduleFor?: Date): Promise<AgentRun> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } })
  if (!agent) throw new Error(`Agent ${agentId} not found`)

  const run = await prisma.agentRun.create({
    data: {
      agentId,
      goal: agent.goal,
      status: 'RUNNING',
      scheduleFor: scheduleFor ?? new Date(),
      startedAt: new Date(),
    },
  })

  interface StepHandle {
    complete: (output: unknown, extra?: { tokensUsed?: number; model?: string }) => Promise<unknown>
    fail: (error: string) => Promise<unknown>
  }

  const makeStep = async (type: AgentStepType, order: number, prompt?: string, input?: unknown): Promise<StepHandle> => {
    const step = await prisma.agentStep.create({
      data: { runId: run.id, type, order, status: 'RUNNING', prompt, input: input as Prisma.InputJsonValue, startedAt: new Date() },
    })
    return {
      complete: (output, extra) =>
        prisma.agentStep.update({ where: { id: step.id }, data: { status: 'DONE', output: output as Prisma.InputJsonValue, tokensUsed: extra?.tokensUsed, model: extra?.model, finishedAt: new Date() } }),
      fail: (error) =>
        prisma.agentStep.update({ where: { id: step.id }, data: { status: 'FAILED', error, finishedAt: new Date() } }),
    }
  }

  try {
    const memory = await getMemories(agentId)
    const memoryBlock = memory.length ? `\nPast learnings:\n${memory.join('\n')}` : ''

    // 1) PLAN
    const planStep = await makeStep('PLAN', 0, PLANNER_PROMPT)
    const planRes = await chat({
      system: systemForAgent(agent),
      user: `${PLANNER_PROMPT}\n\nObjective: ${agent.goal}${memoryBlock}`,
      json: true,
    })
    let topics: string[] = agent.topics
    let angle = agent.goal
    if (planRes) {
      try {
        const p = JSON.parse(planRes.text || '{}')
        topics = Array.isArray(p.topics) && p.topics.length ? p.topics : agent.topics
        angle = p.angle || agent.goal
      } catch {
        /* keep defaults */
      }
      await planStep.complete({ topics, angle }, { tokensUsed: planRes.tokensUsed, model: planRes.model })
    } else {
      await planStep.complete({ topics, angle, fallback: true })
    }

    // 2) RESEARCH
    const researchStep = await makeStep('RESEARCH', 1, RESEARCHER_PROMPT, { angle })
    const researchRes = await chat({
      system: systemForAgent(agent),
      user: `${RESEARCHER_PROMPT}\nAngle: ${angle}`,
      json: true,
    })
    let insights: string[] = []
    if (researchRes) {
      try {
        const r = JSON.parse(researchRes.text || '{}')
        insights = Array.isArray(r.insights) ? r.insights : []
      } catch {
        /* ignore */
      }
      await researchStep.complete({ insights }, { tokensUsed: researchRes.tokensUsed, model: researchRes.model })
    } else {
      await researchStep.complete({ insights: [], fallback: true })
    }

    // 3) GENERATE
    const genStep = await makeStep('GENERATE', 2, WRITER_PROMPT, { angle, insights })
    let candidates: DraftCandidate[]
    const writeRes = await chat({
      system: systemForAgent(agent),
      user: `${WRITER_PROMPT}\nAngle: ${angle}\nInsights: ${insights.join(' | ') || 'none'}${memoryBlock}`,
      json: true,
      temperature: 0.85,
    })
    if (writeRes) {
      try {
        const w = JSON.parse(writeRes.text || '{}')
        const variants = Array.isArray(w.variants) ? w.variants : []
        candidates = variants.map((v: any) => ({
          content: String(v.content ?? ''),
          platforms: Array.isArray(v.platforms) ? v.platforms : agent.platforms,
          topic: v.topic,
          hashtags: Array.isArray(v.hashtags) ? v.hashtags : [],
        }))
      } catch {
        candidates = []
      }
      await genStep.complete({ count: candidates.length }, { tokensUsed: writeRes.tokensUsed, model: writeRes.model })
    } else {
      candidates = fallbackGenerate(agent.goal, topics)
      await genStep.complete({ count: candidates.length, fallback: true })
    }
    candidates = candidates.filter((c) => c.content.trim().length > 0)

    // 4) REVIEW + enrich each candidate
    const reviewStep = await makeStep('REVIEW', 3)
    const drafts: DraftCandidate[] = []
    for (const c of candidates) {
      const htags = c.hashtags && c.hashtags.length ? c.hashtags : await hashtagTool(c.content)
      const review = await scoreTool(c.content, agent.tone)
      drafts.push({ ...c, hashtags: htags, notes: review.notes, agentScore: review.score })
    }
    await reviewStep.complete({ reviewed: drafts.length })

    // Persist drafts (the human-in-the-loop gate)
    const created = await prisma.$transaction(
      drafts.map((d) =>
        prisma.agentDraft.create({
          data: {
            agentId,
            runId: run.id,
            content: d.content,
            platforms: d.platforms as any,
            mediaIds: [],
            tone: agent.tone,
            topic: d.topic,
            hashtags: d.hashtags as any,
            notes: d.notes,
            agentScore: d.agentScore,
            approval: agent.autoPublish ? 'APPROVED' : 'PENDING',
          },
        })
      )
    )

    // 5) SCHEDULE / PUBLISH if autoPublish
    if (agent.autoPublish && created.length) {
      const schedStep = await makeStep('SCHEDULE', 4, undefined, { autoPublish: true })
      // Delegate to approval handler with autoPublish semantics
      const { publishApprovedDrafts } = await import('./approval')
      const n = await publishApprovedDrafts(agent, created.map((d) => d.id))
      await schedStep.complete({ scheduled: n })
    }

    // Learn: record a memory of this run's angle
    await addMemory(agentId, `Produced content on angle: ${angle}`, { kind: 'learning', source: `run:${run.id}`, weight: 1.0 })

    await prisma.agent.update({
      where: { id: agentId },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } },
    })

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: agent.autoPublish ? 'COMPLETED' : 'AWAITING_APPROVAL',
        finishedAt: new Date(),
        output: { draftCount: created.length } as Prisma.InputJsonValue,
      },
    })

    return run
  } catch (err) {
    const message = (err as Error).message
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: message, finishedAt: new Date() },
    })
    throw err
  }
}
