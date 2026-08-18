import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { s3Service } from '@/lib/media/s3'

/**
 * GET /api/media/[id]
 * Returns media metadata
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const media = await prisma.media.findUnique({
      where: { id },
      include: {
        post: { select: { id: true, userId: true, teamId: true } },
        account: { select: { id: true, userId: true, teamId: true } },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Verify ownership through post or account
    const hasAccess =
      (media.post && media.post.userId === user.id) ||
      (media.account && media.account.userId === user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    return NextResponse.json({ media })
  } catch (error) {
    console.error('Get media error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/media/[id]
 * Removes media from S3 and database
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    const media = await prisma.media.findUnique({
      where: { id },
      include: {
        post: { select: { id: true, userId: true, teamId: true } },
        account: { select: { id: true, userId: true, teamId: true } },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // Verify ownership through post or account
    const hasAccess =
      (media.post && media.post.userId === user.id) ||
      (media.account && media.account.userId === user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Delete from S3
    await s3Service.deleteObject(media.s3Key)

    // Delete from database
    await prisma.media.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete media error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}