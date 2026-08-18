import { prisma } from '@/lib/prisma'
import { scheduleDuePosts } from '@/lib/queue/scheduler'

/**
 * Master cron tick. Safe to call every minute.
 * Returns a summary of what ran.
 */
export async function runCronTick(): Promise<{
  duePosts: number
  feedsProcessed: number
  recycled: number
  analyticsRefreshed: number
  agentsRun: number
}> {
  const result = {
    duePosts: 0,
    feedsProcessed: 0,
    recycled: 0,
    analyticsRefreshed: 0,
    agentsRun: 0,
  }

  // 1. Enqueue posts that are due
  try {
    result.duePosts = await scheduleDuePosts()
  } catch (err) {
    console.error('scheduleDuePosts failed:', err)
  }

  // 2. Process RSS feeds due for fetch
  try {
    result.feedsProcessed = await processDueFeeds()
  } catch (err) {
    console.error('processDueFeeds failed:', err)
  }

  // 3. Recycle evergreen posts
  try {
    result.recycled = await recycleEvergreenTick()
  } catch (err) {
    console.error('recycleEvergreen failed:', err)
  }

  // 4. Refresh analytics for recently published posts
  try {
    result.analyticsRefreshed = await refreshRecentAnalytics()
  } catch (err) {
    console.error('refreshAnalytics failed:', err)
  }

  // 5. Run due autonomous agents (throttled by cadence)
  try {
    result.agentsRun = await runDueAgentsTick()
  } catch (err) {
    console.error('runDueAgents failed:', err)
  }

  return result
}

async function processDueFeeds(): Promise<number> {
  const now = new Date()
  const feeds = await prisma.rssFeed.findMany({
    where: {
      autoPost: true,
      OR: [{ lastFetched: null }, { lastFetched: { lt: new Date(now.getTime() - 60 * 60 * 1000) } }],
    },
    take: 20,
  })

  let count = 0
  // Lazy import to avoid hard dependency if module not yet present
  const { processFeed } = await import('@/lib/feed/rss').catch(() => ({ processFeed: null as any }))
  for (const feed of feeds) {
    try {
      if (processFeed) {
        await processFeed(feed.id)
        count++
      }
    } catch (err) {
      console.error(`Feed ${feed.id} failed:`, err)
    }
  }
  return count
}

async function recycleEvergreenTick(): Promise<number> {
  const { recycleEvergreen } = await import('@/lib/posts/evergreen').catch(() => ({ recycleEvergreen: null as any }))
  if (!recycleEvergreen) return 0
  try {
    return await recycleEvergreen()
  } catch {
    return 0
  }
}

async function refreshRecentAnalytics(): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      publishedAt: { gte: since },
    },
    include: {
      user: { select: { socialAccounts: { where: { isActive: true } } } },
      media: true,
    },
    take: 25,
    orderBy: { publishedAt: 'desc' },
  })

  const { fetchPlatformAnalytics } = await import('@/lib/analytics/fetch').catch(() => ({ fetchPlatformAnalytics: null as any }))
  let count = 0
  for (const post of posts) {
    const account = post.user?.socialAccounts?.[0]
    if (!account || !fetchPlatformAnalytics) continue
    try {
      const decrypted = { ...account, accessToken: (await import('@/lib/encryption')).decrypt(account.accessToken) }
      await fetchPlatformAnalytics(
        { id: post.id, platforms: post.platforms, mediaIds: post.mediaIds },
        decrypted
      )
      count++
    } catch (err) {
      console.error(`Analytics for post ${post.id} failed:`, err)
    }
  }
  return count
}

async function runDueAgentsTick(): Promise<number> {
  const { runDueAgents } = await import('@/lib/agents/run').catch(() => ({ runDueAgents: null as any }))
  if (!runDueAgents) return 0
  try {
    return await runDueAgents()
  } catch {
    return 0
  }
}
