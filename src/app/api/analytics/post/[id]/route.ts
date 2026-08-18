import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPostAnalytics } from '@/lib/analytics/aggregate'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { id } = await params

  // Verify ownership - check if post belongs to user or their team
  const post = await prisma.post.findUnique({
    where: { id },
    select: { userId: true, teamId: true },
  })

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  // Check if user owns the post or is a team member
  const isOwner = post.userId === user.id
  let isTeamMember = false

  if (post.teamId) {
    const membership = await prisma.teamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: post.teamId,
        },
      },
    })
    isTeamMember = !!membership
  }

  if (!isOwner && !isTeamMember) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Get analytics
  const analytics = await getPostAnalytics(id)

  return NextResponse.json({ analytics })
}