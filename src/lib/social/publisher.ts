import { decrypt } from '@/lib/encryption'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { xOAuthClient } from '@/lib/social/x'
import { linkedinOAuthClient } from '@/lib/social/linkedin'
import { metaOAuthClient } from '@/lib/social/meta'

export interface PublishResult {
  success: boolean
  platformPostId?: string
  error?: string
}

export interface PostData {
  id: string
  content: string
  mediaIds: string[]
  platforms: string[]
}

/**
 * Publish a post to a specific platform
 */
export async function publishToPlatform(
  platform: string,
  post: PostData,
  account: { accessToken: string; refreshToken: string | null; platformUserId: string }
): Promise<PublishResult> {
  const accessToken = decrypt(account.accessToken)

  try {
    switch (platform) {
      case 'X':
        return await publishToX(accessToken, post)
      case 'LINKEDIN':
        return await publishToLinkedIn(accessToken, post)
      case 'INSTAGRAM':
        return await publishToInstagram(accessToken, post, account.platformUserId)
      case 'FACEBOOK':
        return await publishToFacebook(accessToken, post, account.platformUserId)
      default:
        return { success: false, error: `Unknown platform: ${platform}` }
    }
  } catch (error) {
    console.error(`Failed to publish to ${platform}:`, error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Publish to X (Twitter)
 */
async function publishToX(accessToken: string, post: PostData): Promise<PublishResult> {
  // Upload media if any
  let mediaIds: string[] = []
  if (post.mediaIds.length > 0) {
    // In a real implementation, you'd fetch media from storage
    // For now, we'll skip media upload and just post text
    console.warn('X media upload not fully implemented')
  }

  const result = await xOAuthClient.postTweet(accessToken, post.content, mediaIds)
  return { success: true, platformPostId: result.id }
}

/**
 * Publish to LinkedIn
 */
async function publishToLinkedIn(accessToken: string, post: PostData): Promise<PublishResult> {
  // Upload media if any
  let mediaUrn: string | undefined
  if (post.mediaIds.length > 0) {
    console.warn('LinkedIn media upload not fully implemented')
  }

  const result = await linkedinOAuthClient.createPost(accessToken, post.content, mediaUrn)
  return { success: true, platformPostId: result.id }
}

/**
 * Publish to Instagram (via Meta Graph API)
 */
async function publishToInstagram(accessToken: string, post: PostData, platformUserId: string): Promise<PublishResult> {
  if (post.mediaIds.length === 0) {
    return { success: false, error: 'Instagram requires at least one media item' }
  }

  // Get Instagram Business Account ID
  // In a real implementation, you'd store this when connecting the account
  // For now, we'll use the platformUserId as the Instagram account ID
  const instagramAccountId = platformUserId

  // Media URLs would come from your storage (S3, Cloudinary, etc.)
  const mediaUrls = post.mediaIds.map((id) => `https://your-storage.com/${id}`)

  const result = await metaOAuthClient.publishToInstagram(
    instagramAccountId,
    accessToken,
    post.content,
    mediaUrls,
    mediaUrls.length > 1
  )

  return { success: true, platformPostId: result.id }
}

/**
 * Publish to Facebook Page
 */
async function publishToFacebook(accessToken: string, post: PostData, platformUserId: string): Promise<PublishResult> {
  // The platformUserId for Facebook would be the Page ID
  const pageId = platformUserId

  const mediaUrls = post.mediaIds.map((id) => `https://your-storage.com/${id}`)

  const result = await metaOAuthClient.publishToPage(pageId, accessToken, post.content, mediaUrls)
  return { success: true, platformPostId: result.id }
}

/**
 * Process a scheduled post - publish to all platforms
 */
export async function processScheduledPost(postId: string): Promise<void> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      user: {
        include: {
          socialAccounts: {
            where: { isActive: true },
          },
        },
      },
    },
  })

  if (!post) {
    throw new Error(`Post ${postId} not found`)
  }

  if (post.status !== 'SCHEDULED' && post.status !== 'DRAFT') {
    throw new Error(`Post ${postId} is not scheduled or draft (status: ${post.status})`)
  }

  // Update status to publishing
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'PUBLISHING' },
  })

  const results: Record<string, PublishResult> = {}
  let hasErrors = false

  // Publish to each platform
  for (const platform of post.platforms) {
    const account = (post.user?.socialAccounts ?? []).find((a) => a.platform === platform)
    if (!account) {
      results[platform] = { success: false, error: 'Account not connected' }
      hasErrors = true
      continue
    }

    const postData: PostData = {
      id: post.id,
      content: post.content,
      mediaIds: post.mediaIds,
      platforms: post.platforms,
    }

    results[platform] = await publishToPlatform(platform, postData, {
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      platformUserId: account.platformUserId,
    })

    if (!results[platform].success) {
      hasErrors = true
    }
  }

  // Update post with results
  const allSuccess = Object.values(results).every((r) => r.success)
  await prisma.post.update({
    where: { id: postId },
    data: {
      status: allSuccess ? 'PUBLISHED' : 'FAILED',
      publishedAt: allSuccess ? new Date() : null,
      errorMessage: hasErrors ? (JSON.stringify(results) as any) : Prisma.DbNull,
    },
  })
}