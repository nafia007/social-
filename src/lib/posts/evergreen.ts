import { prisma } from '@/lib/prisma'
import { enqueuePost } from '@/lib/queue/publish-queue'
import { suggestBestTimes, nextBestTimeSlot } from '@/lib/ai/best-time'

const EVERGREEN_MIN_AGE_DAYS = 30
const EVERGREEN_MAX_REPOSTS = 5

/**
 * Recycle evergreen posts: clone old published evergreen posts into new scheduled posts.
 * Returns number of posts recycled.
 */
export async function recycleEvergreen(): Promise<number> {
  const cutoff = new Date(Date.now() - EVERGREEN_MIN_AGE_DAYS * 24 * 60 * 60 * 1000)

  const candidates = await prisma.post.findMany({
    where: {
      isEvergreen: true,
      status: 'PUBLISHED',
      publishedAt: { lt: cutoff },
      repostCount: { lt: EVERGREEN_MAX_REPOSTS },
    },
    take: 10,
  })

  let recycled = 0
  for (const post of candidates) {
    const scope = post.userId ? { userId: post.userId } : { teamId: post.teamId! }
    const best = await suggestBestTimes(scope, post.platforms as any).catch(() => [])
    const nextSlot = nextBestTimeSlot(best as any)

    const clone = await prisma.post.create({
      data: {
        userId: post.userId,
        teamId: post.teamId,
        content: post.content,
        mediaIds: post.mediaIds,
        platforms: post.platforms,
        status: 'SCHEDULED',
        scheduledAt: nextSlot,
        isEvergreen: true,
        aiGenerated: post.aiGenerated,
      },
    })

    // Increment the original's repost count
    await prisma.post.update({
      where: { id: post.id },
      data: { repostCount: { increment: 1 } },
    })

    for (const platform of post.platforms) {
      await enqueuePost(clone.id, platform).catch(() => {})
    }
    recycled++
  }

  return recycled
}

/**
 * Set a post's scheduledAt to the next best time for its platforms.
 */
export async function scheduleWithBestTime(postId: string): Promise<Date> {
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post) throw new Error('Post not found')

  const scope = post.userId ? { userId: post.userId } : { teamId: post.teamId! }
  const best = await suggestBestTimes(scope, post.platforms as any).catch(() => [])
  const slot = nextBestTimeSlot(best as any)

  await prisma.post.update({
    where: { id: postId },
    data: { status: 'SCHEDULED', scheduledAt: slot },
  })
  return slot
}
