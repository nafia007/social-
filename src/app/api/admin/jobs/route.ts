import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

/**
 * Admin observability: queue jobs + webhook events.
 * Requires the user to be an OWNER/ADMIN of at least one team, or simply authenticated
 * for now (this is a self-serve SaaS; tighten with plan/role checks later).
 */
export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const scope = url.searchParams.get('scope') || 'jobs'

  if (scope === 'webhooks') {
    const events = await prisma.webhookEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ events })
  }

  if (scope === 'stats') {
    const [jobsByStatus, webhooksPending] = await Promise.all([
      prisma.queueJob.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.webhookEvent.count({ where: { processed: false } }),
    ])
    return NextResponse.json({ jobsByStatus, webhooksPending })
  }

  // default: jobs
  const status = url.searchParams.get('status') || undefined
  const jobs = await prisma.queueJob.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { post: { select: { content: true, platforms: true, status: true } } },
  })
  return NextResponse.json({ jobs })
}
