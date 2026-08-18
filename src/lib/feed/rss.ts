import Parser from 'rss-parser'
import { prisma } from '@/lib/prisma'
import { Platform, RssFeed } from '@prisma/client'
import { enqueuePost } from '@/lib/queue/publish-queue'

const parser = new Parser()

interface FeedItem {
  title: string
  link: string
  content: string
  hash: string
}

function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

/**
 * Fetch items from an RSS feed.
 */
export async function fetchRssItems(feed: RssFeed): Promise<FeedItem[]> {
  const parsed = await parser.parseURL(feed.url)
  const items: FeedItem[] = (parsed.items || []).map((item) => {
    const text = `${item.title || ''} ${item.contentSnippet || item.content || ''}`
    return {
      title: item.title || 'Untitled',
      link: item.link || '',
      content: text.slice(0, 280),
      hash: hashString(item.link || item.title || text),
    }
  })
  return items
}

/**
 * Process a single feed: fetch, dedupe via lastItemHash, optionally auto-post.
 */
export async function processFeed(feedId: string): Promise<number> {
  const feed = await prisma.rssFeed.findUnique({ where: { id: feedId } })
  if (!feed || !feed.autoPost) return 0

  const items = await fetchRssItems(feed)
  if (items.length === 0) return 0

  // Only act on the newest item if it's new
  const newest = items[0]
  if (feed.lastItemHash === newest.hash) {
    await prisma.rssFeed.update({
      where: { id: feedId },
      data: { lastFetched: new Date() },
    })
    return 0
  }

  // Create a scheduled post from the item
  const owner = feed.userId
    ? await prisma.user.findUnique({ where: { id: feed.userId } })
    : null
  const team = feed.teamId
    ? await prisma.team.findUnique({ where: { id: feed.teamId } })
    : null

  const post = await prisma.post.create({
    data: {
      userId: feed.userId,
      teamId: feed.teamId,
      content: `${newest.title}\n\n${newest.content}\n\n${newest.link}`,
      platforms: feed.platforms,
      status: 'SCHEDULED',
      scheduledAt: new Date(Date.now() + 60 * 1000), // publish ~1 min out; cron enqueues
      aiGenerated: false,
    },
  })

  // Enqueue for publishing
  for (const platform of feed.platforms) {
    await enqueuePost(post.id, platform).catch(() => {})
  }

  await prisma.rssFeed.update({
    where: { id: feedId },
    data: { lastFetched: new Date(), lastItemHash: newest.hash },
  })

  void owner
  void team
  return 1
}
