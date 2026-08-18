import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { AppError, requireTeamRole } from '@/lib/teams/rbac'
import { requireUser } from '@/lib/agents/context'

const createSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  goal: z.string().min(5).max(1000),
  type: z.enum(['CONTENT_STRATEGIST', 'COPYWRITER', 'RESEARCHER', 'REVIEWER', 'SCHEDULER']).default('CONTENT_STRATEGIST'),
  tone: z.string().max(40).default('professional'),
  topics: z.array(z.string()).default([]),
  hashtags: z.array(z.string()).default([]),
  platforms: z.array(z.enum(['X', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK'])).min(1).default(['X']),
  cadenceHours: z.number().int().min(1).max(720).default(24),
  autoPublish: z.boolean().default(false),
  model: z.string().max(60).optional(),
  config: z.any().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId') || undefined
    const ctx = await requireUser(teamId)
    const where = ctx.teamId ? { teamId: ctx.teamId } : { userId: ctx.userId, teamId: null }
    const agents = await prisma.agent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runs: true, drafts: true } } },
    })
    return NextResponse.json({ agents })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Failed to list agents' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId') || undefined
    const ctx = await requireUser(teamId)
    const body = createSchema.parse(await request.json())

    // Team-scoped creation requires at least MEMBER role
    if (ctx.teamId) await requireTeamRole(ctx.teamId, ['OWNER', 'ADMIN', 'MEMBER'])

    const agent = await prisma.agent.create({
      data: {
        ...body,
        userId: ctx.teamId ? null : ctx.userId,
        teamId: ctx.teamId ?? null,
        model: body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        config: body.config as any,
      },
    })
    return NextResponse.json({ agent }, { status: 201 })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('Create agent error:', err)
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 })
  }
}
