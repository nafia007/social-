import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { requireTeamRole } from '@/lib/teams/rbac'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Any member can view the team
  const membership = await requireTeamRole(id, ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']).catch(() => null)
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        include: { user: { select: { name: true, email: true, imageUrl: true } } },
        orderBy: { createdAt: 'asc' },
      },
      socialAccounts: { select: { id: true, platform: true, platformUsername: true, isActive: true } },
      _count: { select: { posts: true } },
    },
  })

  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ team })
}
