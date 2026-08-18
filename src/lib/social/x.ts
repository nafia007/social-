import { OAuthClient, OAuthConfig, TokenResponse, UserInfo } from './oauth'

/**
 * X (Twitter) OAuth 2.0 with PKCE
 * Docs: https://developer.twitter.com/en/docs/authentication/oauth-2-0/authorization-code
 */
export class XOAuthClient extends OAuthClient {
  constructor() {
    const config: OAuthConfig = {
      clientId: process.env.X_CLIENT_ID!,
      clientSecret: process.env.X_CLIENT_SECRET!,
      redirectUri: process.env.X_REDIRECT_URI!,
      scopes: [
        'tweet.read',
        'tweet.write',
        'users.read',
        'offline.access',
      ],
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      userInfoUrl: 'https://api.twitter.com/2/users/me',
    }
    super(config)
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  static async generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
    const codeVerifier = this.base64URLEncode(crypto.getRandomValues(new Uint8Array(32)))
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
    const codeChallenge = this.base64URLEncode(new Uint8Array(digest))
    return { codeVerifier, codeChallenge }
  }

  private static base64URLEncode(buffer: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i])
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
  }

  /**
   * Get authorization URL with PKCE
   */
  getAuthUrlWithPKCE(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    return `${this.config.authUrl}?${params.toString()}`
  }

  /**
   * Exchange code for token with PKCE
   */
  async exchangeCodeForTokenWithPKCE(code: string, codeVerifier: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`X token exchange failed: ${error}`)
    }

    return response.json()
  }

  /**
   * Post a tweet
   */
  async postTweet(accessToken: string, text: string, mediaIds?: string[]): Promise<{ id: string }> {
    const body: Record<string, unknown> = { text }
    if (mediaIds && mediaIds.length > 0) {
      body.media = { media_ids: mediaIds }
    }

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`X post failed: ${JSON.stringify(error)}`)
    }

    return response.json()
  }

  /**
   * Upload media to X
   */
  async uploadMedia(accessToken: string, mediaBuffer: Buffer, mimeType: string): Promise<string> {
    // For simplicity, using media upload v1.1 endpoint
    // In production, use chunked upload for videos
    const formData = new FormData()
    const uint8Array = new Uint8Array(mediaBuffer)
    formData.append('media', new Blob([uint8Array], { type: mimeType }))

    const response = await fetch('https://upload.twitter.com/1.1/media/upload.json', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`X media upload failed: ${error}`)
    }

    const data = await response.json()
    return data.media_id_string
  }
}

export const xOAuthClient = new XOAuthClient()