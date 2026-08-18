import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { AppError, requireTeamRole } from '@/lib/teams/rbac'
import { requireUser } from '@/lib/agents/context'

const patchSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  goal: z.string().min(5).max(1000).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DRAFT']).optional(),
  tone: z.string().max(40).optional(),
  topics: z.array(z.string()).optional(),
  hashtags: z.array(z.string()).optional(),
  platforms: z.array(z.enum(['X', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK'])).optional(),
  cadenceHours: z.number().int().min(1).max(720).optional(),
  autoPublish: z.boolean().optional(),
  model: z.string().max(60).optional(),
  config: z.any().optional(),
})

async function getOwnedAgent(id: string, ctx: { userId: string; teamId?: string }) {
  const agent = await prisma.agent.findUnique({ where: { id } })
  if (!agent) throw new AppError('Agent not found', 404)
  const owns = agent.userId === ctx.userId || (ctx.teamId && agent.teamId === ctx.teamId)
  if (!owns) throw new AppError('Forbidden', 403)
  return agent
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireUser()
    const agent = await getOwnedAgent(id, ctx)
    const full = await prisma.agent.findUnique({
      where: { id },
      include: {
        runs: { orderBy: { createdAt: 'desc' }, take: 10, include: { steps: { orderBy: { order: 'asc' } }, _count: { select: { drafts: true } } } },
        drafts: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { runs: true, drafts: true, memories: true } },
      },
    })
    return NextResponse.json({ agent: full })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Failed to load agent' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireUser()
    await getOwnedAgent(id, ctx)
    if (ctx.teamId) await requireTeamRole(ctx.teamId, ['OWNER', 'ADMIN', 'MEMBER'])
    const data = patchSchema.parse(await request.json())
    const agent = await prisma.agent.update({ where: { id }, data: data as any })
    return NextResponse.json({ agent })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireUser()
    await getOwnedAgent(id, ctx)
    if (ctx.teamId) await requireTeamRole(ctx.teamId, ['OWNER', 'ADMIN'])
    await prisma.agent.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
  }
}
