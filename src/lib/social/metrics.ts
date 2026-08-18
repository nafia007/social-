import { xOAuthClient } from './x'
import { linkedinOAuthClient } from './linkedin'
import { metaOAuthClient } from './meta'
import { decrypt } from '@/lib/encryption'

/**
 * X (Twitter) metrics fetching
 */
export async function fetchXMetrics(
  accessToken: string,
  platformPostId: string
): Promise<{
  impressions: number
  likes: number
  retweets: number
  replies: number
  quotes: number
}> {
  const response = await fetch(
    `https://api.twitter.com/2/tweets/${platformPostId}?tweet.fields=public_metrics`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`X metrics fetch failed: ${error}`)
  }

  const data = await response.json()
  const metrics = data.data?.public_metrics

  if (!metrics) {
    throw new Error('No public_metrics in X response')
  }

  return {
    impressions: metrics.impression_count ?? 0,
    likes: metrics.like_count ?? 0,
    retweets: metrics.retweet_count ?? 0,
    replies: metrics.reply_count ?? 0,
    quotes: metrics.quote_count ?? 0,
  }
}

/**
 * LinkedIn metrics fetching
 */
export async function fetchLinkedInMetrics(
  accessToken: string,
  platformPostId: string
): Promise<{
  impressions: number
  likes: number
  comments: number
  shares: number
  clicks: number
}> {
  // The UGC post URN format is typically "urn:li:ugcPost:12345"
  // For statistics endpoint, we need the numeric ID
  const postId = platformPostId.replace('urn:li:ugcPost:', '')

  const response = await fetch(
    `https://api.linkedin.com/v2/ugcPosts/${postId}/statistics?q=statistics&projection=(totalSocialActivityCounts,likeCount,commentCount,shareCount,clickCount,impressionCount)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LinkedIn metrics fetch failed: ${error}`)
  }

  const data = await response.json()
  const elements = data.elements?.[0] || {}

  return {
    impressions: elements.impressionCount ?? 0,
    likes: elements.likeCount ?? 0,
    comments: elements.commentCount ?? 0,
    shares: elements.shareCount ?? 0,
    clicks: elements.clickCount ?? 0,
  }
}

/**
 * Instagram/Meta metrics fetching
 */
export async function fetchMetaMetrics(
  accessToken: string,
  platformPostId: string
): Promise<Record<string, number>> {
  const metrics = 'impressions,reach,likes,comments,shares,saves'

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${platformPostId}/insights?metric=${metrics}&access_token=${accessToken}`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Meta metrics fetch failed: ${error}`)
  }

  const data = await response.json()

  // Parse the insights response
  const result: Record<string, number> = {
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
  }

  if (data.data && Array.isArray(data.data)) {
    for (const insight of data.data) {
      const name = insight.name
      const value = insight.values?.[0]?.value ?? 0

      if (name in result) {
        result[name] = typeof value === 'number' ? value : 0
      }
    }
  }

  return result
}

/**
 * Fetch metrics for a specific platform account
 */
export async function fetchPlatformMetrics(
  platform: 'X' | 'LINKEDIN' | 'INSTAGRAM' | 'FACEBOOK',
  encryptedAccessToken: string,
  platformPostId: string
): Promise<Record<string, number>> {
  const accessToken = decrypt(encryptedAccessToken)

  switch (platform) {
    case 'X': {
      const metrics = await fetchXMetrics(accessToken, platformPostId)
      return {
        impressions: metrics.impressions,
        engagements: metrics.likes + metrics.retweets + metrics.replies + metrics.quotes,
        likes: metrics.likes,
        comments: metrics.replies,
        shares: metrics.retweets,
        clicks: 0,
        reach: 0,
      }
    }
    case 'LINKEDIN': {
      const metrics = await fetchLinkedInMetrics(accessToken, platformPostId)
      return {
        impressions: metrics.impressions,
        engagements: metrics.likes + metrics.comments + metrics.shares + metrics.clicks,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        clicks: metrics.clicks,
        reach: 0,
      }
    }
    case 'INSTAGRAM':
    case 'FACEBOOK': {
      const metrics = await fetchMetaMetrics(accessToken, platformPostId)
      return {
        impressions: metrics.impressions,
        engagements: metrics.likes + metrics.comments + metrics.shares + metrics.saves,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        clicks: 0,
        reach: metrics.reach,
      }
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}