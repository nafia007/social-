import { prisma } from '@/lib/prisma'
import { Platform, Analytics, Prisma } from '@prisma/client'

export interface PostAnalyticsResult {
  postId: string
  latest: {
    [platform: string]: {
      impressions: number
      engagements: number
      likes: number
      comments: number
      shares: number
      clicks: number
      reach: number
      fetchedAt: Date
    }
  }
  totals: {
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    reach: number
  }
  timeSeries: Array<{
    platform: Platform
    fetchedAt: Date
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    reach: number
  }>
}

export interface AccountAnalyticsResult {
  accountId: string
  platform: Platform
  timeSeries: Array<{
    date: Date
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    reach: number
  }>
  totals: {
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    reach: number
  }
}

/**
 * Get analytics for a specific post
 * Returns latest per-platform metrics + totals + time series
 */
export async function getPostAnalytics(postId: string): Promise<PostAnalyticsResult> {
  // Get all analytics rows for this post, ordered by fetchedAt desc
  const analytics = await prisma.analytics.findMany({
    where: { postId },
    orderBy: { fetchedAt: 'desc' },
  })

  if (analytics.length === 0) {
    return {
      postId,
      latest: {},
      totals: {
        impressions: 0,
        engagements: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        reach: 0,
      },
      timeSeries: [],
    }
  }

  // Get latest per platform
  const latest: PostAnalyticsResult['latest'] = {}
  const seenPlatforms = new Set<Platform>()

  for (const a of analytics) {
    if (!seenPlatforms.has(a.platform)) {
      latest[a.platform] = {
        impressions: a.impressions,
        engagements: a.engagements,
        likes: a.likes,
        comments: a.comments,
        shares: a.shares,
        clicks: a.clicks,
        reach: a.reach,
        fetchedAt: a.fetchedAt,
      }
      seenPlatforms.add(a.platform)
    }
  }

  // Calculate totals from latest per platform
  const totals = {
    impressions: 0,
    engagements: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    clicks: 0,
    reach: 0,
  }

  for (const platform of Object.keys(latest)) {
    const data = latest[platform]
    totals.impressions += data.impressions
    totals.engagements += data.engagements
    totals.likes += data.likes
    totals.comments += data.comments
    totals.shares += data.shares
    totals.clicks += data.clicks
    totals.reach += data.reach
  }

  // Time series (all data points)
  const timeSeries = analytics.map((a) => ({
    platform: a.platform,
    fetchedAt: a.fetchedAt,
    impressions: a.impressions,
    engagements: a.engagements,
    likes: a.likes,
    comments: a.comments,
    shares: a.shares,
    clicks: a.clicks,
    reach: a.reach,
  }))

  return { postId, latest, totals, timeSeries }
}

/**
 * Get analytics for a social account over a time range
 * Returns time series aggregated by day
 */
export async function getAccountAnalytics(
  accountId: string,
  from: Date,
  to: Date
): Promise<AccountAnalyticsResult> {
  // Get the account to know the platform
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: { platform: true },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  // Get all posts for this account
  const posts = await prisma.post.findMany({
    where: { accountId },
    select: { id: true },
  })

  const postIds = posts.map((p) => p.id)

  if (postIds.length === 0) {
    return {
      accountId,
      platform: account.platform,
      timeSeries: [],
      totals: {
        impressions: 0,
        engagements: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        reach: 0,
      },
    }
  }

  // Get analytics for these posts within the date range
  const analytics = await prisma.analytics.findMany({
    where: {
      postId: { in: postIds },
      platform: account.platform,
      fetchedAt: { gte: from, lte: to },
    },
    orderBy: { fetchedAt: 'asc' },
  })

  // Group by day
  const dailyMap = new Map<string, AccountAnalyticsResult['timeSeries'][0]>()

  for (const a of analytics) {
    const dateKey = a.fetchedAt.toISOString().split('T')[0]
    const existing = dailyMap.get(dateKey)

    if (existing) {
      existing.impressions += a.impressions
      existing.engagements += a.engagements
      existing.likes += a.likes
      existing.comments += a.comments
      existing.shares += a.shares
      existing.clicks += a.clicks
      existing.reach += a.reach
    } else {
      dailyMap.set(dateKey, {
        date: new Date(dateKey),
        impressions: a.impressions,
        engagements: a.engagements,
        likes: a.likes,
        comments: a.comments,
        shares: a.shares,
        clicks: a.clicks,
        reach: a.reach,
      })
    }
  }

  const timeSeries = Array.from(dailyMap.values()).sort((a, b) => a.date.getTime() - b.date.getTime())

  // Calculate totals
  const totals = timeSeries.reduce(
    (acc, day) => {
      acc.impressions += day.impressions
      acc.engagements += day.engagements
      acc.likes += day.likes
      acc.comments += day.comments
      acc.shares += day.shares
      acc.clicks += day.clicks
      acc.reach += day.reach
      return acc
    },
    {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      reach: 0,
    }
  )

  return { accountId, platform: account.platform, timeSeries, totals }
}

/**
 * Get analytics for all posts by a user (or team) over a time range
 */
export async function getUserAnalytics(
  userId: string,
  from: Date,
  to: Date,
  teamId?: string
): Promise<{
  posts: PostAnalyticsResult[]
  totals: {
    impressions: number
    engagements: number
    likes: number
    comments: number
    shares: number
    clicks: number
    reach: number
  }
}> {
  const whereClause: Prisma.PostWhereInput = teamId
    ? { teamId, status: 'PUBLISHED' }
    : { userId, status: 'PUBLISHED' }

  const posts = await prisma.post.findMany({
    where: whereClause,
    select: { id: true },
  })

  const postAnalytics = await Promise.all(posts.map((p) => getPostAnalytics(p.id)))

  const totals = postAnalytics.reduce(
    (acc, p) => {
      acc.impressions += p.totals.impressions
      acc.engagements += p.totals.engagements
      acc.likes += p.totals.likes
      acc.comments += p.totals.comments
      acc.shares += p.totals.shares
      acc.clicks += p.totals.clicks
      acc.reach += p.totals.reach
      return acc
    },
    {
      impressions: 0,
      engagements: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
      reach: 0,
    }
  )

  return { posts: postAnalytics, totals }
}