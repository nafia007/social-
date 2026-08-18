import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/teams/rbac'
import { requireUser } from '@/lib/agents/context'

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId') || undefined
    const ctx = await requireUser(teamId)
    const where = ctx.teamId ? { agent: { teamId: ctx.teamId } } : { agent: { userId: ctx.userId, teamId: null } }

    const runs = await prisma.agentRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
        steps: { orderBy: { order: 'asc' } },
        _count: { select: { drafts: true } },
      },
      take: 40,
    })
    return NextResponse.json({ runs })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    return NextResponse.json({ error: 'Failed to load runs' }, { status: 500 })
  }
}
