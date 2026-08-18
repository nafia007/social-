import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/teams/rbac'
import { requireUser } from '@/lib/agents/context'
import { approveDraft, rejectDraft } from '@/lib/agents/approval'

/**
 * GET  -> the human approval queue: pending drafts for the current user/team
 * POST -> approve or reject a draft (human-in-the-loop)
 */
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId') || undefined
    const ctx = await requireUser(teamId)
    const where = ctx.teamId
      ? { agent: { teamId: ctx.teamId } }
      : { agent: { userId: ctx.userId, teamId: null } }

    const drafts = await prisma.agentDraft.findMany({
      where: { ...where, approval: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { agent: { select: { id: true, name: true } }, run: { select: { id: true, goal: true } } },
      take: 50,
    })
    return NextResponse.json({ drafts })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Failed to load drafts' }, { status: 500 })
  }
}

const actionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  draftId: z.string(),
  editedContent: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId') || undefined
    const ctx = await requireUser(teamId)
    const { action, draftId, editedContent, scheduledAt, reason } = actionSchema.parse(await request.json())

    if (action === 'approve') {
      const res = await approveDraft(draftId, {
        reviewedById: ctx.clerkUserId,
        editedContent,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      })
      return NextResponse.json({ result: res })
    } else {
      const res = await rejectDraft(draftId, { reviewedById: ctx.clerkUserId, reason })
      return NextResponse.json({ result: res })
    }
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('Draft action error:', err)
    return NextResponse.json({ error: 'Failed to action draft' }, { status: 500 })
  }
}
