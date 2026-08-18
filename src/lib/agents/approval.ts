import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { Agent, AgentDraft } from './types'

/**
 * Human-in-the-loop approval gate.
 * Approving a draft turns it into a scheduled Post (or publishes immediately
 * if the agent has autoPublish and a schedule time is set).
 */

export interface ApproveResult {
  draftId: string
  postId?: string
  status: 'APPROVED' | 'REJECTED' | 'EDITED'
}

async function resolveOwner(agent: Agent): Promise<{ userId: string | null; teamId: string | null }> {
  return { userId: agent.userId, teamId: agent.teamId }
}

/**
 * Approve (optionally with an edited version) a single draft and create a Post.
 */
export async function approveDraft(
  draftId: string,
  opts?: { reviewedById?: string; editedContent?: string; scheduledAt?: Date }
): Promise<ApproveResult> {
  const draft = await prisma.agentDraft.findUnique({ where: { id: draftId } })
  if (!draft) throw new Error('Draft not found')

  const finalContent = opts?.editedContent?.trim() ? opts!.editedContent.trim() : draft.content
  const agent = await prisma.agent.findUnique({ where: { id: draft.agentId } })
  if (!agent) throw new Error('Agent not found')

  const { userId, teamId } = await resolveOwner(agent)

  // Decide schedule time: explicit, else best-time suggestion, else now+1h
  let scheduledAt = opts?.scheduledAt
  if (!scheduledAt) {
    const { suggestBestTimes, nextBestTimeSlot } = await import('@/lib/ai/best-time')
    const best = await suggestBestTimes(
      { userId: agent.userId ?? undefined, teamId: agent.teamId ?? undefined },
      agent.platforms as any
    )
    scheduledAt = nextBestTimeSlot(best)
  }

  const post = await prisma.post.create({
    data: {
      userId,
      teamId,
      agentId: agent.id,
      content: finalContent,
      mediaIds: draft.mediaIds,
      platforms: draft.platforms,
      status: 'SCHEDULED',
      scheduledAt,
      aiGenerated: true,
      timezone: agent.config && (agent.config as any).timezone ? String((agent.config as any).timezone) : 'UTC',
    },
  })

  const status = opts?.editedContent?.trim() ? 'EDITED' : 'APPROVED'
  await prisma.agentDraft.update({
    where: { id: draftId },
    data: {
      approval: status,
      reviewedById: opts?.reviewedById,
      reviewedAt: new Date(),
      editedContent: opts?.editedContent ?? null,
      postId: post.id,
    },
  })

  await prisma.agentRun.updateMany({
    where: { id: draft.runId ?? undefined },
    data: { status: 'APPROVED' },
  })

  // Feedback memory
  const { recordFeedback } = await import('./memory')
  await recordFeedback(agent.id, draftId, true, status === 'EDITED' ? 'human edited before approval' : undefined)

  return { draftId, postId: post.id, status }
}

export async function rejectDraft(draftId: string, opts?: { reviewedById?: string; reason?: string }): Promise<ApproveResult> {
  const draft = await prisma.agentDraft.findUnique({ where: { id: draftId } })
  if (!draft) throw new Error('Draft not found')

  await prisma.agentDraft.update({
    where: { id: draftId },
    data: { approval: 'REJECTED', reviewedById: opts?.reviewedById, reviewedAt: new Date() },
  })

  await prisma.agentRun.updateMany({
    where: { id: draft.runId ?? undefined },
    data: { status: 'REJECTED' },
  })

  const { recordFeedback } = await import('./memory')
  await recordFeedback(draft.agentId, draftId, false, opts?.reason)

  return { draftId, status: 'REJECTED' }
}

/**
 * Used by the runner when autoPublish is enabled: mark drafts approved and
 * schedule them immediately.
 */
export async function publishApprovedDrafts(agent: Agent, draftIds: string[]): Promise<number> {
  let count = 0
  for (const id of draftIds) {
    const res = await approveDraft(id, { scheduledAt: nextRunTime(agent) })
    if (res.postId) count++
  }
  return count
}

function nextRunTime(agent: Agent): Date {
  // Spread posts across the cadence window starting now
  return new Date(Date.now() + 60 * 60 * 1000)
}
