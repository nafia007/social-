import { NextRequest, NextResponse } from 'next/server'
import { scheduleDuePosts } from '@/lib/queue/scheduler'

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Schedule due posts - this will enqueue jobs for the worker to process
    const scheduledCount = await scheduleDuePosts()

    return NextResponse.json({ 
      scheduled: scheduledCount,
      message: scheduledCount > 0 
        ? `Scheduled ${scheduledCount} posts for publishing` 
        : 'No due posts to schedule'
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}
