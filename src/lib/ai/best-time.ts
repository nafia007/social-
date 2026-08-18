import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

interface BestTime {
  platform: Platform
  hourUTC: number
  dayOfWeek: number // 0 = Sunday
  score: number
}

const DEFAULT_HOURS: Record<Platform, number> = {
  X: 13,
  LINKEDIN: 9,
  INSTAGRAM: 17,
  FACEBOOK: 15,
}

/**
 * Suggest best posting times per platform based on historical engagement by hour.
 * Falls back to sensible defaults when no data exists.
 */
export async function suggestBestTimes(
  scope: { userId?: string; teamId?: string },
  platforms: Platform[]
): Promise<BestTime[]> {
  const results: BestTime[] = []

  for (const platform of platforms) {
    const rows = await prisma.analytics.groupBy({
      by: ['fetchedAt'],
      where: {
        platform,
        post: scope.userId ? { userId: scope.userId } : scope.teamId ? { teamId: scope.teamId } : {},
        engagements: { gt: 0 },
      },
      _avg: { engagements: true },
      _count: { _all: true },
    })

    // Bucket by hour of day (UTC) from publishedAt via the post relation
    const hourly = new Array(24).fill(0)
    const hourlyCount = new Array(24).fill(0)

    const posts = await prisma.post.findMany({
      where: {
        platforms: { has: platform },
        ...(scope.userId ? { userId: scope.userId } : scope.teamId ? { teamId: scope.teamId } : {}),
        publishedAt: { not: null },
        analytics: { some: { platform } },
      },
      select: { publishedAt: true, analytics: { where: { platform }, select: { engagements: true } } },
      take: 500,
    })

    for (const post of posts) {
      if (!post.publishedAt) continue
      const hour = post.publishedAt.getUTCHours()
      const eng = post.analytics.reduce((s: number, a: { engagements: number }) => s + a.engagements, 0)
      hourly[hour] += eng
      hourlyCount[hour] += 1
    }

    let bestHour = DEFAULT_HOURS[platform]
    let bestScore = -1
    for (let h = 0; h < 24; h++) {
      if (hourlyCount[h] === 0) continue
      const score = hourly[h] / hourlyCount[h]
      if (score > bestScore) {
        bestScore = score
        bestHour = h
      }
    }

    results.push({
      platform,
      hourUTC: bestHour,
      dayOfWeek: 2, // Tuesday default; refine with weekday data later
      score: bestScore < 0 ? 0 : bestScore,
    })
  }

  return results
}

/**
 * Given a platform set, return the next future timestamp at the best hour.
 */
export function nextBestTimeSlot(best: BestTime[], from: Date = new Date()): Date {
  if (best.length === 0) {
    const d = new Date(from)
    d.setHours(d.getHours() + 1)
    return d
  }
  // Use the earliest best hour across platforms
  const minHour = Math.min(...best.map((b) => b.hourUTC))
  const d = new Date(from)
  d.setUTCHours(minHour, 0, 0, 0)
  if (d <= from) d.setDate(d.getDate() + 1)
  return d
}
