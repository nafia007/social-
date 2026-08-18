import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'

const createPostSchema = z.object({
  content: z.string().min(1).max(10000),
  mediaIds: z.array(z.string()).optional(),
  platforms: z.array(z.enum(['X', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK'])).min(1),
  scheduledAt: z.string().datetime().optional(),
})

export async function GET(request: NextRequest) {
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

  const searchParams = request.nextUrl.searchParams
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '20')
  const cursor = searchParams.get('cursor')

  const posts = await prisma.post.findMany({
    where: {
      userId: user.id,
      ...(status ? { status: status as any } : {}),
    },
    include: {
      media: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  let nextCursor: string | undefined
  if (posts.length > limit) {
    const nextPost = posts.pop()
    nextCursor = nextPost!.id
  }

  return NextResponse.json({ posts, nextCursor })
}

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
    const data = createPostSchema.parse(body)

    // Verify user has connected accounts for all requested platforms
    const accounts = await prisma.socialAccount.findMany({
      where: {
        userId: user.id,
        platform: { in: data.platforms },
        isActive: true,
      },
    })

    const connectedPlatforms = accounts.map((a) => a.platform)
    const missingPlatforms = data.platforms.filter((p) => !connectedPlatforms.includes(p))

    if (missingPlatforms.length > 0) {
      return NextResponse.json(
        { error: `Missing connected accounts for: ${missingPlatforms.join(', ')}` },
        { status: 400 }
      )
    }

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        content: data.content,
        mediaIds: data.mediaIds || [],
        platforms: data.platforms,
        status: data.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      },
      include: { media: true },
    })

    return NextResponse.json({ post }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    console.error('Create post error:', err)
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })
  }
}