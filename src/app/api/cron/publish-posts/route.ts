import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { processScheduledPost } from '@/lib/social/publisher'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find posts that are scheduled and due for publishing
    const now = new Date()
    const posts = await prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
      },
      take: 50, // Limit to prevent timeout
      orderBy: { scheduledAt: 'asc' },
    })

    console.log(`Found ${posts.length} posts to publish`)

    const results = []

    for (const post of posts) {
      try {
        await processScheduledPost(post.id)
        results.push({ postId: post.id, success: true })
      } catch (error) {
        console.error(`Failed to process post ${post.id}:`, error)
        results.push({ 
          postId: post.id, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        })
      }
    }

    return NextResponse.json({ 
      processed: results.length,
      results 
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}