import { OAuthClient, OAuthConfig, TokenResponse, UserInfo } from './oauth'

/**
 * Meta (Facebook + Instagram) OAuth 2.0
 * Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
 * Instagram: https://developers.facebook.com/docs/instagram-basic-display-api/getting-started
 * Instagram Graph API: https://developers.facebook.com/docs/instagram-api/getting-started
 */
export class MetaOAuthClient extends OAuthClient {
  constructor() {
    const config: OAuthConfig = {
      clientId: process.env.META_APP_ID!,
      clientSecret: process.env.META_APP_SECRET!,
      redirectUri: process.env.META_REDIRECT_URI!,
      scopes: [
        'pages_show_list',
        'pages_read_engagement',
        'pages_manage_posts',
        'instagram_basic',
        'instagram_content_publish',
        'public_profile',
        'email',
      ],
      authUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v20.0/oauth/access_token',
      userInfoUrl: 'https://graph.facebook.com/v20.0/me',
    }
    super(config)
  }

  /**
   * Get long-lived access token (60 days)
   */
  async getLongLivedToken(shortLivedToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      fb_exchange_token: shortLivedToken,
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Meta long-lived token exchange failed: ${error}`)
    }

    return response.json()
  }

  /**
   * Get user's Facebook pages
   */
  async getUserPages(accessToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,instagram_business_account`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Meta pages fetch failed: ${error}`)
    }

    const data = await response.json()
    return data.data || []
  }

  /**
   * Get Instagram Business Account linked to a Page
   */
  async getInstagramAccount(pageAccessToken: string, pageId: string): Promise<{ id: string; username: string } | null> {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}?fields=instagram_business_account{id,username}`,
      {
        headers: {
          Authorization: `Bearer ${pageAccessToken}`,
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.instagram_business_account || null
  }

  /**
   * Publish to Facebook Page
   */
  async publishToPage(
    pageAccessToken: string,
    pageId: string,
    message: string,
    mediaUrls?: string[]
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = { message }

    if (mediaUrls && mediaUrls.length > 0) {
      // For multiple images, use multi-photo post
      if (mediaUrls.length > 1) {
        body.attached_media = mediaUrls.map((url) => ({ media_fbid: url }))
      } else {
        // Single image - need to upload first
        const photoId = await this.uploadPhoto(pageAccessToken, pageId, mediaUrls[0])
        body.attached_media = [{ media_fbid: photoId }]
      }
    }

    const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Facebook post failed: ${JSON.stringify(error)}`)
    }

    return response.json()
  }

  /**
   * Upload photo to Facebook
   */
  async uploadPhoto(pageAccessToken: string, pageId: string, imageUrl: string): Promise<string> {
    // Download the image first (in production, upload directly from buffer)
    const imageResponse = await fetch(imageUrl)
    const imageBuffer = await imageResponse.arrayBuffer()

    const formData = new FormData()
    formData.append('source', new Blob([imageBuffer]))
    formData.append('published', 'false')

    const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}/photos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Facebook photo upload failed: ${error}`)
    }

    const data = await response.json()
    return data.id
  }

  /**
   * Publish to Instagram (via Instagram Graph API)
   */
  async publishToInstagram(
    instagramAccountId: string,
    pageAccessToken: string,
    caption: string,
    mediaUrls: string[],
    isCarousel: boolean = false
  ): Promise<{ id: string }> {
    if (mediaUrls.length === 0) {
      throw new Error('Instagram requires at least one media item')
    }

    if (mediaUrls.length === 1) {
      // Single image/video
      const containerId = await this.createMediaContainer(instagramAccountId, pageAccessToken, {
        image_url: mediaUrls[0],
        caption,
      })

      return this.publishMediaContainer(instagramAccountId, pageAccessToken, containerId)
    } else {
      // Carousel
      const childrenIds = await Promise.all(
        mediaUrls.map((url) => this.createMediaContainer(instagramAccountId, pageAccessToken, { image_url: url, is_carousel_item: true }))
      )

      const containerId = await this.createMediaContainer(instagramAccountId, pageAccessToken, {
        media_type: 'CAROUSEL',
        caption,
        children: childrenIds,
      })

      return this.publishMediaContainer(instagramAccountId, pageAccessToken, containerId)
    }
  }

  /**
   * Create media container for Instagram
   */
  private async createMediaContainer(
    instagramAccountId: string,
    pageAccessToken: string,
    params: Record<string, unknown>
  ): Promise<string> {
    const response = await fetch(`https://graph.facebook.com/v20.0/${instagramAccountId}/media`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Instagram container creation failed: ${JSON.stringify(error)}`)
    }

    const data = await response.json()
    return data.id
  }

  /**
   * Publish media container to Instagram
   */
  private async publishMediaContainer(
    instagramAccountId: string,
    pageAccessToken: string,
    containerId: string
  ): Promise<{ id: string }> {
    const response = await fetch(`https://graph.facebook.com/v20.0/${instagramAccountId}/media_publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ creation_id: containerId }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Instagram publish failed: ${JSON.stringify(error)}`)
    }

    return response.json()
  }
}

export const metaOAuthClient = new MetaOAuthClient()