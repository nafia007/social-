import prisma from '@/lib/prisma'
import { Platform, Prisma } from '@prisma/client'

export interface RateLimitOptions {
  accountId?: string
  teamId?: string
}

export interface ConsumeResult {
  allowed: boolean
  retryAfterMs?: number
}

/**
 * Get or create a rate limit bucket for the given platform and account/team
 */
async function getOrCreateBucket(
  platform: Platform,
  options: RateLimitOptions
): Promise<{
  id: string
  platform: Platform
  accountId: string | null
  teamId: string | null
  tokens: number
  maxTokens: number
  refillPerSec: number
  lastRefill: Date
}> {
  // Default limits per platform (can be customized per account/team later)
  const defaultLimits: Record<Platform, { maxTokens: number; refillPerSec: number }> = {
    X: { maxTokens: 300, refillPerSec: 1 }, // ~300 requests per 15 min window
    LINKEDIN: { maxTokens: 100, refillPerSec: 0.1 }, // Conservative
    INSTAGRAM: { maxTokens: 200, refillPerSec: 0.5 }, // Meta API limits
    FACEBOOK: { maxTokens: 200, refillPerSec: 0.5 },
  }

  const limits = defaultLimits[platform]

  const bucket = await prisma.rateLimitBucket.upsert({
    where: options.accountId
      ? { platform_accountId: { platform, accountId: options.accountId } }
      : { platform_teamId: { platform, teamId: options.teamId! } },
    create: {
      platform,
      accountId: options.accountId ?? null,
      teamId: options.teamId ?? null,
      tokens: limits.maxTokens,
      maxTokens: limits.maxTokens,
      refillPerSec: limits.refillPerSec,
      lastRefill: new Date(),
    },
    update: {},
  })

  return bucket
}

/**
 * Refill tokens based on time elapsed since last refill
 */
function refillTokens(bucket: {
  tokens: number
  maxTokens: number
  refillPerSec: number
  lastRefill: Date
}): { tokens: number; lastRefill: Date } {
  const now = new Date()
  const elapsedSeconds = (now.getTime() - bucket.lastRefill.getTime()) / 1000
  const tokensToAdd = elapsedSeconds * bucket.refillPerSec
  const newTokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd)

  return {
    tokens: newTokens,
    lastRefill: now,
  }
}

/**
 * Consume a token from the rate limit bucket
 * Returns { allowed: true } if token was consumed, or { allowed: false, retryAfterMs } if rate limited
 */
export async function consume(
  platform: Platform,
  options: RateLimitOptions = {}
): Promise<ConsumeResult> {
  const bucket = await getOrCreateBucket(platform, options)

  // Refill tokens based on time elapsed
  const { tokens: refilledTokens, lastRefill } = refillTokens(bucket)

  if (refilledTokens >= 1) {
    // Consume a token
    const newTokens = refilledTokens - 1

    await prisma.rateLimitBucket.update({
      where: { id: bucket.id },
      data: {
        tokens: newTokens,
        lastRefill,
      },
    })

    return { allowed: true }
  }

  // Rate limited - calculate retry after
  const tokensNeeded = 1 - refilledTokens
  const retryAfterSec = tokensNeeded / bucket.refillPerSec
  const retryAfterMs = Math.ceil(retryAfterSec * 1000)

  // Update lastRefill to now (but keep tokens as-is)
  await prisma.rateLimitBucket.update({
    where: { id: bucket.id },
    data: {
      lastRefill: new Date(),
    },
  })

  return { allowed: false, retryAfterMs }
}

/**
 * Manually refill a bucket (useful for testing or admin operations)
 */
export async function refill(
  platform: Platform,
  options: RateLimitOptions = {}
): Promise<void> {
  const bucket = await getOrCreateBucket(platform, options)

  await prisma.rateLimitBucket.update({
    where: { id: bucket.id },
    data: {
      tokens: bucket.maxTokens,
      lastRefill: new Date(),
    },
  })
}

/**
 * Get current bucket status (for debugging/monitoring)
 */
export async function getBucketStatus(
  platform: Platform,
  options: RateLimitOptions = {}
): Promise<{
  tokens: number
  maxTokens: number
  refillPerSec: number
  lastRefill: Date
} | null> {
  try {
    const bucket = await prisma.rateLimitBucket.findUnique({
      where: options.accountId
        ? { platform_accountId: { platform, accountId: options.accountId } }
        : { platform_teamId: { platform, teamId: options.teamId! } },
    })

    if (!bucket) return null

    const { tokens } = refillTokens(bucket)

    return {
      tokens,
      maxTokens: bucket.maxTokens,
      refillPerSec: bucket.refillPerSec,
      lastRefill: bucket.lastRefill,
    }
  } catch {
    return null
  }
}