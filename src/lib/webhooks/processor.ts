import { prisma } from '@/lib/prisma'
import { WebhookProvider, NotificationType, Platform, Prisma } from '@prisma/client'

interface WebhookEventWithPost {
  id: string
  provider: WebhookProvider
  postId: string | null
  accountId: string | null
  eventType: string
  payload: Record<string, unknown>
  processed: boolean
}

/**
 * Process a webhook event
 * Marks as processed, extracts mentions/metrics/comments
 * Creates notifications for MENTION events
 */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
  }) as WebhookEventWithPost | null

  if (!event) {
    console.error(`Webhook event ${eventId} not found`)
    return
  }

  if (event.processed) {
    console.log(`Webhook event ${eventId} already processed`)
    return
  }

  try {
    // Process based on provider and event type
    switch (event.provider) {
      case WebhookProvider.META:
        await processMetaEvent(event)
        break
      case WebhookProvider.X:
        await processXEvent(event)
        break
      case WebhookProvider.LINKEDIN:
        await processLinkedInEvent(event)
        break
      default:
        console.log(`No processor for provider ${event.provider}`)
    }

    // Mark as processed
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    })
  } catch (error) {
    console.error(`Failed to process webhook event ${eventId}:`, error)

    // Mark as processed with error
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        processed: true,
        processedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })
  }
}

async function processMetaEvent(event: WebhookEventWithPost): Promise<void> {
  const payload = event.payload as Record<string, unknown>

  // Meta webhook payload structure for Instagram/Facebook
  // https://developers.facebook.com/docs/graph-api/webhooks/reference/page/
  // https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/

  const entry = payload.entry as Array<Record<string, unknown>> | undefined
  if (!entry || !Array.isArray(entry)) return

  for (const item of entry) {
    const changes = item.changes as Array<Record<string, unknown>> | undefined
    if (!changes || !Array.isArray(changes)) continue

    for (const change of changes) {
      const field = change.field as string | undefined
      const value = change.value as Record<string, unknown> | undefined
      if (!value) continue

      // Handle different event types
      switch (field) {
        case 'mentions':
          await handleMetaMention(event, value)
          break
        case 'comments':
          await handleMetaComment(event, value)
          break
        case 'feed':
          await handleMetaFeed(event, value)
          break
        default:
          console.log(`Unhandled Meta field: ${field}`)
      }
    }
  }
}

async function processXEvent(event: WebhookEventWithPost): Promise<void> {
  const payload = event.payload as Record<string, unknown>

  // X Account Activity API webhook structure
  // https://developer.twitter.com/en/docs/twitter-api/premium/account-activity-api/overview

  // Direct message events
  const dmEvents = payload.direct_message_events as Array<Record<string, unknown>> | undefined
  if (dmEvents) {
    for (const dm of dmEvents) {
      await handleXDirectMessage(event, dm)
    }
  }

  // Tweet create events
  const tweetCreateEvents = payload.tweet_create_events as Array<Record<string, unknown>> | undefined
  if (tweetCreateEvents) {
    for (const tweet of tweetCreateEvents) {
      await handleXTweetCreate(event, tweet)
    }
  }

  // Mention events (in tweet_create_events or separate)
  const mentions = payload.mentions as Array<Record<string, unknown>> | undefined
  if (mentions) {
    for (const mention of mentions) {
      await handleXMention(event, mention)
    }
  }
}

async function processLinkedInEvent(event: WebhookEventWithPost): Promise<void> {
  // LinkedIn webhook structure
  // https://learn.microsoft.com/en-us/linkedin/shared/integrations/webhooks/webhook-setup
  console.log('LinkedIn webhook processing not yet implemented')
}

/**
 * Handle Meta mention events - create notification
 */
async function handleMetaMention(event: WebhookEventWithPost, value: Record<string, unknown>): Promise<void> {
  if (!event.postId) return

  // Get the post to find the owner
  const post = await prisma.post.findUnique({
    where: { id: event.postId },
    select: { userId: true, teamId: true },
  })

  if (!post) return

  // Create notification for the post owner (user or team members)
  const userId = post.userId
  if (userId) {
    await prisma.notification.create({
      data: {
        userId,
        type: NotificationType.MENTION,
        title: 'New Mention',
        message: `Your post was mentioned on ${event.provider}`,
        data: {
          postId: event.postId,
          webhookEventId: event.id,
          platform: event.provider,
          mentionData: value,
        } as Prisma.InputJsonValue,
      },
    })
  }
}

async function handleMetaComment(event: WebhookEventWithPost, value: Record<string, unknown>): Promise<void> {
  // Could store comment data or create notification
  console.log('Meta comment received:', value)
}

async function handleMetaFeed(event: WebhookEventWithPost, value: Record<string, unknown>): Promise<void> {
  // Feed changes (post published, etc.)
  console.log('Meta feed change:', value)
}

/**
 * Handle X direct message - could create notification
 */
async function handleXDirectMessage(event: WebhookEventWithPost, dm: Record<string, unknown>): Promise<void> {
  console.log('X DM received:', dm)
}

/**
 * Handle X tweet create - could update post status
 */
async function handleXTweetCreate(event: WebhookEventWithPost, tweet: Record<string, unknown>): Promise<void> {
  console.log('X tweet created:', tweet)
}

/**
 * Handle X mention - create notification
 */
async function handleXMention(event: WebhookEventWithPost, mention: Record<string, unknown>): Promise<void> {
  if (!event.postId) return

  const post = await prisma.post.findUnique({
    where: { id: event.postId },
    select: { userId: true, teamId: true },
  })

  if (!post) return

  const userId = post.userId
  if (userId) {
    await prisma.notification.create({
      data: {
        userId,
        type: NotificationType.MENTION,
        title: 'New Mention',
        message: `Your post was mentioned on X`,
        data: {
          postId: event.postId,
          webhookEventId: event.id,
          platform: 'X',
          mentionData: mention,
        } as Prisma.InputJsonValue,
      },
    })
  }
}

/**
 * Process multiple webhook events (for cron/batch jobs)
 */
export async function processPendingWebhooks(limit: number = 100): Promise<number> {
  const events = await prisma.webhookEvent.findMany({
    where: { processed: false },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let processed = 0
  for (const event of events) {
    await processWebhookEvent(event.id)
    processed++
  }

  return processed
}

/**
 * Get unprocessed webhook events for monitoring
 */
export async function getUnprocessedWebhooks(): Promise<WebhookEventWithPost[]> {
  return prisma.webhookEvent.findMany({
    where: { processed: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
  }) as Promise<WebhookEventWithPost[]>
}