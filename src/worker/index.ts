import { Worker, Job } from 'bullmq'
import { connection } from '@/lib/queue/connection'
import { consume } from '@/lib/queue/rate-limiter'
import { requeueJob } from '@/lib/queue/publish-queue'
import { processScheduledPost } from '@/lib/social/publisher'
import prisma from '@/lib/prisma'
import { Platform, JobStatus, PostStatus, Prisma } from '@prisma/client'
import { notify } from '@/lib/notify/notify'

const worker = new Worker(
  'publish-queue',
  async (job: Job<{ postId: string; platform: string }>) => {
    const { postId, platform } = job.data
    const platformEnum = platform as Platform

    console.log(`Processing job ${job.id} for post ${postId} on ${platform}`)

    try {
      // Get the QueueJob record
      const queueJob = await prisma.queueJob.findFirst({
        where: { postId, platform: platformEnum },
        orderBy: { createdAt: 'desc' },
      })

      if (!queueJob) {
        console.error(`QueueJob not found for post ${postId} on ${platform}`)
        return
      }

      // Check rate limiter
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { accountId: true, teamId: true },
      })

      const rateLimitOptions: { accountId?: string; teamId?: string } = {}
      if (post?.accountId) rateLimitOptions.accountId = post.accountId
      else if (post?.teamId) rateLimitOptions.teamId = post.teamId

      const rateLimitResult = await consume(platformEnum, rateLimitOptions)

      if (!rateLimitResult.allowed) {
        const delayMs = rateLimitResult.retryAfterMs ?? 60000
        console.log(`Rate limited for ${platform}, requeueing with ${delayMs}ms delay`)
        await requeueJob(postId, platform, delayMs, queueJob.attempt, queueJob.maxAttempts)
        return
      }

      // Update QueueJob to PROCESSING
      await prisma.queueJob.update({
        where: { id: queueJob.id },
        data: {
          status: JobStatus.PROCESSING,
          attempt: { increment: 1 },
          startedAt: new Date(),
        },
      })

      // Process the post
      await processScheduledPost(postId)

      // Get updated post to check results
      const updatedPost = await prisma.post.findUnique({
        where: { id: postId },
        select: { status: true, errorMessage: true },
      })

      // Mark QueueJob as COMPLETED
      await prisma.queueJob.update({
        where: { id: queueJob.id },
        data: {
          status: JobStatus.COMPLETED,
          finishedAt: new Date(),
          result: { success: true },
        },
      })

      // Notify owner of overall success (once, when all platforms done)
      const allJobs = await prisma.queueJob.findMany({ where: { postId }, select: { status: true } })
      const allDone = allJobs.every((j) => j.status === JobStatus.COMPLETED || j.status === JobStatus.DEAD)
      if (allDone) {
        const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true, teamId: true, content: true } })
        if (post?.userId) {
          await notify({
            userId: post.userId,
            type: 'POST_PUBLISHED',
            title: 'Post published',
            message: `Your post was published to ${platform}.`,
            data: { postId },
          }).catch(() => {})
        }
      }

      console.log(`Job ${job.id} completed successfully for post ${postId} on ${platform}`)
    } catch (error) {
      console.error(`Job ${job.id} failed for post ${postId} on ${platform}:`, error)

      // Get the queue job again to check attempt count
      const queueJob = await prisma.queueJob.findFirst({
        where: { postId, platform: platformEnum },
        orderBy: { createdAt: 'desc' },
      })

      if (!queueJob) {
        console.error(`QueueJob not found for post ${postId} on ${platform}`)
        return
      }

      const isRateLimitError = isRateLimitErrorResponse(error)
      const attempt = queueJob.attempt + 1

      if (attempt >= queueJob.maxAttempts || isRateLimitError) {
        // Max attempts reached or rate limit error - mark as DEAD
        await handleJobFailure(postId, platformEnum, queueJob, error, attempt, true)
      } else {
        // Retry with exponential backoff
        const delayMs = calculateBackoffDelay(attempt)
        console.log(`Retrying job ${job.id} (attempt ${attempt}/${queueJob.maxAttempts}) with ${delayMs}ms delay`)
        await requeueJob(postId, platform, delayMs, attempt, queueJob.maxAttempts)
      }
    }
  },
  { connection }
)

function isRateLimitErrorResponse(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('rate limited')
    )
  }
  return false
}

function calculateBackoffDelay(attempt: number): number {
  // Exponential backoff: 5s, 10s, 20s, 40s, 80s...
  return Math.min(5000 * Math.pow(2, attempt - 1), 300000) // Cap at 5 minutes
}

async function handleJobFailure(
  postId: string,
  platform: Platform,
  queueJob: { id: string; maxAttempts: number },
  error: unknown,
  attempt: number,
  isFinal: boolean
): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'

  // Update QueueJob
  await prisma.queueJob.update({
    where: { id: queueJob.id },
    data: {
      status: isFinal ? JobStatus.DEAD : JobStatus.FAILED,
      attempt,
      finishedAt: new Date(),
      error: errorMessage,
      result: { success: false, error: errorMessage },
    },
  })

  // Get the post to check overall status
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { status: true, platforms: true, retryCount: true, maxRetries: true },
  })

  if (!post) return

  // Count completed/failed jobs for this post
  const jobs = await prisma.queueJob.findMany({
    where: { postId },
    select: { platform: true, status: true },
  })

  const completedPlatforms = jobs.filter((j) => j.status === JobStatus.COMPLETED).map((j) => j.platform)
  const failedPlatforms = jobs.filter((j) => j.status === JobStatus.DEAD).map((j) => j.platform)
  const pendingPlatforms = jobs.filter(
    (j) =>
      j.status === JobStatus.QUEUED ||
      j.status === JobStatus.PROCESSING ||
      j.status === JobStatus.RETRYING
  ).map((j) => j.platform)

  // Determine final post status
  let newStatus: PostStatus
  let newRetryCount = post.retryCount

  if (isFinal) {
    newRetryCount = post.retryCount + 1
  }

  if (completedPlatforms.length === post.platforms.length) {
    newStatus = PostStatus.PUBLISHED
  } else if (failedPlatforms.length > 0 && pendingPlatforms.length === 0) {
    // All platforms have finished, some failed
    if (completedPlatforms.length > 0) {
      newStatus = PostStatus.PARTIALLY_PUBLISHED
    } else {
      newStatus = PostStatus.FAILED
    }
  } else if (failedPlatforms.length > 0) {
    // Some failed but others still pending - keep PUBLISHING
    newStatus = PostStatus.PUBLISHING
  } else {
    newStatus = PostStatus.PUBLISHING
  }

  // Update post
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: newStatus,
      retryCount: newRetryCount,
      errorMessage: failedPlatforms.length > 0
        ? {
            failedPlatforms: failedPlatforms.map(p => p.toString()),
            error: errorMessage,
            timestamp: new Date().toISOString(),
          }
        : Prisma.DbNull,
      publishedAt: newStatus === PostStatus.PUBLISHED ? new Date() : undefined,
    },
  })

  // Notify owner on final failure for any platform
  if (isFinal && failedPlatforms.length > 0) {
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } })
    if (post?.userId) {
      await notify({
        userId: post.userId,
        type: 'POST_FAILED',
        title: 'Post failed to publish',
        message: `Failed on ${platform}: ${errorMessage.slice(0, 200)}`,
        data: { postId, platform },
      }).catch(() => {})
    }
  }

  console.log(
    `Post ${postId} status updated to ${newStatus} (completed: ${completedPlatforms.length}, failed: ${failedPlatforms.length}, pending: ${pendingPlatforms.length})`
  )
}

// Handle worker events
worker.on('completed', (job) => {
  console.log(`Worker: Job ${job.id} completed`)
})

worker.on('failed', (job, err) => {
  console.error(`Worker: Job ${job?.id} failed:`, err)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

console.log('Publish worker started')

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down worker...')
  await worker.close()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('Shutting down worker...')
  await worker.close()
  await prisma.$disconnect()
  process.exit(0)
})