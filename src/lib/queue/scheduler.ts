import prisma from '@/lib/prisma'
import { enqueuePost } from './publish-queue'
import { PostStatus, Platform, Prisma } from '@prisma/client'

/**
 * Schedule all due posts for publishing
 * Finds posts with status SCHEDULED and scheduledAt <= now,
 * sets them to PUBLISHING, and enqueues one job per platform.
 * Returns the number of posts scheduled.
 */
export async function scheduleDuePosts(): Promise<number> {
  const now = new Date()

  // Find posts that are scheduled and due for publishing
  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      scheduledAt: { lte: now },
    },
    take: 100, // Limit to prevent timeout
    orderBy: { scheduledAt: 'asc' },
  })

  if (posts.length === 0) {
    console.log('No due posts to schedule')
    return 0
  }

  console.log(`Found ${posts.length} due posts to schedule`)

  let scheduledCount = 0

  for (const post of posts) {
    try {
      // Use a transaction to atomically update post status and create queue jobs
      await prisma.$transaction(async (tx) => {
        // Double-check the post is still SCHEDULED (avoid race conditions)
        const currentPost = await tx.post.findUnique({
          where: { id: post.id },
          select: { status: true, platforms: true },
        })

        if (!currentPost || currentPost.status !== PostStatus.SCHEDULED) {
          console.log(`Post ${post.id} is no longer SCHEDULED (current: ${currentPost?.status}), skipping`)
          return
        }

        // Update post status to PUBLISHING
        await tx.post.update({
          where: { id: post.id },
          data: { status: PostStatus.PUBLISHING },
        })

        // Enqueue one job per platform
        for (const platform of currentPost.platforms) {
          await enqueuePost(post.id, platform)
        }

        scheduledCount++
        console.log(`Scheduled post ${post.id} for ${currentPost.platforms.length} platforms`)
      })
    } catch (error) {
      console.error(`Failed to schedule post ${post.id}:`, error)
      // Continue with other posts
    }
  }

  console.log(`Successfully scheduled ${scheduledCount} posts`)
  return scheduledCount
}

/**
 * Schedule a specific post by ID (for manual scheduling)
 */
export async function schedulePost(postId: string): Promise<boolean> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true, scheduledAt: true, platforms: true },
  })

  if (!post) {
    console.error(`Post ${postId} not found`)
    return false
  }

  if (post.status !== PostStatus.SCHEDULED) {
    console.log(`Post ${postId} is not SCHEDULED (current: ${post.status})`)
    return false
  }

  const now = new Date()
  if (post.scheduledAt && post.scheduledAt > now) {
    console.log(`Post ${postId} is scheduled for the future (${post.scheduledAt})`)
    return false
  }

  try {
    await prisma.$transaction(async (tx) => {
      const currentPost = await tx.post.findUnique({
        where: { id: postId },
        select: { status: true, platforms: true },
      })

      if (!currentPost || currentPost.status !== PostStatus.SCHEDULED) {
        throw new Error(`Post ${postId} is no longer SCHEDULED`)
      }

      await tx.post.update({
        where: { id: postId },
        data: { status: PostStatus.PUBLISHING },
      })

      for (const platform of currentPost.platforms) {
        await enqueuePost(postId, platform)
      }
    })

    console.log(`Manually scheduled post ${postId}`)
    return true
  } catch (error) {
    console.error(`Failed to manually schedule post ${postId}:`, error)
    return false
  }
}