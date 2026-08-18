import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { fetchAndStoreAnalytics, getPlatformPostIds } from '@/lib/analytics/fetch'

export async function POST(request: NextRequest) {
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

  try {
    const body = await request.json()
    const { postId } = body

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    // Verify ownership
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true, teamId: true, platforms: true, mediaIds: true },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

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

    // Get the social accounts for the post's platforms
    // If post has accountId, use that; otherwise find user/team accounts for the platforms
    let accounts
    if (post.teamId) {
      accounts = await prisma.socialAccount.findMany({
        where: {
          teamId: post.teamId,
          platform: { in: post.platforms },
          isActive: true,
        },
      })
    } else {
      accounts = await prisma.socialAccount.findMany({
        where: {
          userId: user.id,
          platform: { in: post.platforms },
          isActive: true,
        },
      })
    }

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'No connected accounts for the post platforms' },
        { status: 400 }
      )
    }

    // Get platform post IDs (from media records)
    const platformPostIds = await getPlatformPostIds(postId)

    // Check if we have platform post IDs for all platforms
    const missingPlatforms = post.platforms.filter((p) => !platformPostIds[p])
    if (missingPlatforms.length > 0) {
      return NextResponse.json(
        { error: `Missing platform post IDs for: ${missingPlatforms.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch and store analytics
    const results = await fetchAndStoreAnalytics(
      {
        id: post.id,
        platforms: post.platforms,
        mediaIds: post.mediaIds,
      },
      accounts.map((a) => ({
        platform: a.platform,
        accessToken: a.accessToken,
        platformUserId: a.platformUserId,
      })),
      platformPostIds
    )

    return NextResponse.json({
      success: true,
      analytics: results,
      fetchedPlatforms: results.map((r) => r.platform),
    })
  } catch (error) {
    console.error('Analytics refresh error:', error)
    return NextResponse.json({ error: 'Failed to refresh analytics' }, { status: 500 })
  }
}