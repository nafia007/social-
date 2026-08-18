import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AppError, requireTeamRole } from '@/lib/teams/rbac'
import { requireUser } from '@/lib/agents/context'
import { runAgent } from '@/lib/agents/run'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await requireUser()
    const agent = await prisma.agent.findUnique({ where: { id } })
    if (!agent) throw new AppError('Agent not found', 404)
    const owns = agent.userId === ctx.userId || (ctx.teamId && agent.teamId === ctx.teamId)
    if (!owns) throw new AppError('Forbidden', 403)
    if (ctx.teamId) await requireTeamRole(ctx.teamId, ['OWNER', 'ADMIN', 'MEMBER'])

    const runId = await runAgent(id)
    return NextResponse.json({ runId, status: 'queued' }, { status: 202 })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('Run agent error:', err)
    return NextResponse.json({ error: 'Failed to run agent' }, { status: 500 })
  }
}
