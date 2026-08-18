import { OAuthClient, OAuthConfig, TokenResponse, UserInfo } from './oauth'

/**
 * LinkedIn OAuth 2.0
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
 */
export class LinkedInOAuthClient extends OAuthClient {
  constructor() {
    const config: OAuthConfig = {
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
      redirectUri: process.env.LINKEDIN_REDIRECT_URI!,
      scopes: [
        'r_liteprofile',
        'r_emailaddress',
        'w_member_social',
      ],
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
    }
    super(config)
  }

  /**
   * Get user info - LinkedIn uses a different endpoint for profile
   */
  async getUserProfile(accessToken: string): Promise<UserInfo & { sub: string }> {
    // Use OpenID Connect userinfo endpoint
    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`LinkedIn profile fetch failed: ${error}`)
    }

    return response.json()
  }

  /**
   * Post to LinkedIn (Member Share)
   */
  async createPost(accessToken: string, text: string, mediaUrn?: string): Promise<{ id: string }> {
    const author = await this.getUserProfile(accessToken)
    
    const body: Record<string, unknown> = {
      author: `urn:li:person:${author.sub}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: mediaUrn ? 'IMAGE' : 'NONE',
          media: mediaUrn ? [{ status: 'READY', media: mediaUrn }] : [],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    }

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`LinkedIn post failed: ${JSON.stringify(error)}`)
    }

    // LinkedIn returns the URN in the header
    const postUrn = response.headers.get('x-restli-id')
    return { id: postUrn || '' }
  }

  /**
   * Upload image to LinkedIn
   */
  async uploadImage(accessToken: string, mediaBuffer: Buffer, mimeType: string): Promise<string> {
    // Step 1: Register upload
    const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          owner: `urn:li:person:${(await this.getUserProfile(accessToken)).sub}`,
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
        },
      }),
    })

    if (!registerResponse.ok) {
      const error = await registerResponse.text()
      throw new Error(`LinkedIn upload register failed: ${error}`)
    }

    const { value } = await registerResponse.json()
    const uploadUrl = value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl
    const assetUrn = value.asset

    // Step 2: Upload the file
    const uint8Array = new Uint8Array(mediaBuffer)
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: uint8Array,
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`LinkedIn file upload failed: ${error}`)
    }

    return assetUrn
  }
}

export const linkedinOAuthClient = new LinkedInOAuthClient()