import { Queue } from 'bullmq'
import { connection } from './connection'
import prisma from '@/lib/prisma'
import { Platform, JobStatus, Prisma } from '@prisma/client'

export const publishQueue = new Queue('publish-queue', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 5000,
  },
})

export interface EnqueuePostOptions {
  delayMs?: number
  priority?: number
}

/**
 * Enqueue a post for publishing to a specific platform
 */
export async function enqueuePost(
  postId: string,
  platform: string,
  opts: EnqueuePostOptions = {}
): Promise<void> {
  // Check if QueueJob already exists for this post/platform
  const existingJob = await prisma.queueJob.findFirst({
    where: {
      postId,
      platform: platform as Platform,
      status: {
        in: [JobStatus.QUEUED, JobStatus.PROCESSING, JobStatus.RETRYING],
      },
    },
  })

  if (existingJob) {
    console.log(`Job already exists for post ${postId} on ${platform}, skipping`)
    return
  }

  // Get the post to determine maxRetries
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { maxRetries: true },
  })

  const maxAttempts = post?.maxRetries ?? 5

  // Create QueueJob row
  const queueJob = await prisma.queueJob.create({
    data: {
      postId,
      platform: platform as Platform,
      status: JobStatus.QUEUED,
      attempt: 0,
      maxAttempts,
      priority: opts.priority ?? 0,
      payload: { postId, platform },
      scheduledFor: opts.delayMs ? new Date(Date.now() + opts.delayMs) : new Date(),
    },
  })

  // Add BullMQ job with jobId = `${postId}:${platform}`
  const jobId = `${postId}:${platform}`

  await publishQueue.add(
    'publish',
    { postId, platform },
    {
      jobId,
      delay: opts.delayMs,
      priority: opts.priority ?? 0,
      attempts: maxAttempts,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 5000,
    }
  )

  console.log(`Enqueued post ${postId} for ${platform} (jobId: ${jobId})`)
}

/**
 * Requeue a job with a delay (for rate limiting or retries)
 */
export async function requeueJob(
  postId: string,
  platform: string,
  delayMs: number,
  attempt: number,
  maxAttempts: number
): Promise<void> {
  const jobId = `${postId}:${platform}`

  // Update QueueJob status to RETRYING
  await prisma.queueJob.updateMany({
    where: { postId, platform: platform as Platform },
    data: {
      status: JobStatus.RETRYING,
      attempt,
      scheduledFor: new Date(Date.now() + delayMs),
    },
  })

  // Add BullMQ job with delay
  await publishQueue.add(
    'publish',
    { postId, platform },
    {
      jobId,
      delay: delayMs,
      priority: 0,
      attempts: maxAttempts - attempt,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 5000,
    }
  )

  console.log(`Requeued post ${postId} for ${platform} with delay ${delayMs}ms (attempt ${attempt}/${maxAttempts})`)
}