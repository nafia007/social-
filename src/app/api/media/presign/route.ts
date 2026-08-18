import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateMediaFile, type MediaKind } from '@/lib/media/validate'
import { s3Service, buildPublicUrl } from '@/lib/media/s3'
import prisma from '@/lib/prisma'

// Input validation schema
const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  postId: z.string().cuid().optional(),
  accountId: z.string().cuid().optional(),
})

type PresignRequest = z.infer<typeof presignSchema>

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find the user in our database
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = presignSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      )
    }

    const { filename, contentType, size, postId, accountId } = parseResult.data

    // Validate media file
    const validation = validateMediaFile({ name: filename, type: contentType, size })
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Verify postId belongs to user if provided
    if (postId) {
      const post = await prisma.post.findFirst({
        where: { id: postId, userId: user.id },
      })
      if (!post) {
        return NextResponse.json({ error: 'Post not found or access denied' }, { status: 404 })
      }
    }

    // Verify accountId belongs to user if provided
    if (accountId) {
      const account = await prisma.socialAccount.findFirst({
        where: { id: accountId, userId: user.id },
      })
      if (!account) {
        return NextResponse.json({ error: 'Account not found or access denied' }, { status: 404 })
      }
    }

    // Generate S3 key
    const key = s3Service.generateKey(user.id, filename)

    // Generate presigned upload URL
    const uploadUrl = await s3Service.getPresignedUploadUrl(key, contentType)

    // Build the public URL
    const url = buildPublicUrl(key)

    // Create Media record in database (pending upload)
    const media = await prisma.media.create({
      data: {
        postId,
        accountId,
        type: validation.kind,
        s3Key: key,
        url,
        mimeType: contentType,
        size,
      },
    })

    return NextResponse.json({
      uploadUrl,
      key,
      url,
      mediaType: validation.kind,
      mediaId: media.id,
    })
  } catch (error) {
    console.error('Presign error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}