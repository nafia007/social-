import { prisma } from '@/lib/prisma'
import { Platform, Analytics, SocialAccount } from '@prisma/client'
import { fetchPlatformMetrics } from '@/lib/social/metrics'
import { decrypt } from '@/lib/encryption'

interface PostWithPlatforms {
  id: string
  platforms: Platform[]
  mediaIds: string[]
}

interface AccountWithTokens {
  platform: Platform
  accessToken: string
  platformUserId: string
}

interface PlatformPostIdMap {
  [platform: string]: string
}

/**
 * Fetch analytics for a post across all its platforms
 * Returns array of Partial<Analytics> that can be stored
 */
export async function fetchPlatformAnalytics(
  post: PostWithPlatforms,
  accounts: AccountWithTokens[],
  platformPostIds: PlatformPostIdMap
): Promise<Partial<Analytics>[]> {
  const results: Partial<Analytics>[] = []

  for (const platform of post.platforms) {
    const account = accounts.find((a) => a.platform === platform)
    if (!account) {
      console.warn(`No account found for platform ${platform} for post ${post.id}`)
      continue
    }

    const platformPostId = platformPostIds[platform]
    if (!platformPostId) {
      console.warn(`No platform post ID for ${platform} for post ${post.id}`)
      continue
    }

    try {
      const metrics = await fetchPlatformMetrics(platform, account.accessToken, platformPostId)

      const analyticsData: Partial<Analytics> = {
        postId: post.id,
        platform,
        impressions: metrics.impressions,
        engagements: metrics.engagements,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        clicks: metrics.clicks,
        reach: metrics.reach,
        fetchedAt: new Date(),
      }

      results.push(analyticsData)
    } catch (error) {
      console.error(`Failed to fetch ${platform} analytics for post ${post.id}:`, error)
      // Continue with other platforms
    }
  }

  return results
}

/**
 * Fetch and store analytics for a post
 */
export async function fetchAndStoreAnalytics(
  post: PostWithPlatforms,
  accounts: AccountWithTokens[],
  platformPostIds: PlatformPostIdMap
): Promise<Analytics[]> {
  const analyticsData = await fetchPlatformAnalytics(post, accounts, platformPostIds)

  const stored: Analytics[] = []

  for (const data of analyticsData) {
    // Create a new analytics row for each fetch (daily granularity)
    const analytics = await prisma.analytics.create({
      data: {
        postId: data.postId!,
        platform: data.platform!,
        impressions: data.impressions!,
        engagements: data.engagements!,
        likes: data.likes!,
        comments: data.comments!,
        shares: data.shares!,
        clicks: data.clicks!,
        reach: data.reach!,
        fetchedAt: data.fetchedAt!,
      },
    })
    stored.push(analytics)
  }

  return stored
}

/**
 * Get the platform post IDs for a post by looking at media accounts or other sources
 * This is a placeholder - in reality you'd store platformPostId when publishing
 */
export async function getPlatformPostIds(postId: string): Promise<PlatformPostIdMap> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      media: true,
    },
  })

  if (!post) {
    return {}
  }

  const result: PlatformPostIdMap = {}

  // Try to get platform media IDs from the media records
  for (const media of post.media) {
    if (media.platformMediaIds && typeof media.platformMediaIds === 'object') {
      const platformMediaIds = media.platformMediaIds as Record<string, string>
      for (const [platform, platformMediaId] of Object.entries(platformMediaIds)) {
        result[platform as Platform] = platformMediaId
      }
    }
  }

  return result
}