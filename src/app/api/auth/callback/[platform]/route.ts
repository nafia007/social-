import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { decrypt, encrypt } from '@/lib/encryption'
import prisma from '@/lib/prisma'
import { xOAuthClient } from '@/lib/social/x'
import { linkedinOAuthClient } from '@/lib/social/linkedin'
import { metaOAuthClient } from '@/lib/social/meta'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.redirect(new URL('/sign-in', request.url))
  }

  const { platform } = await params
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Verify state
  const storedState = request.cookies.get(`oauth_state_${platform}`)?.value
  if (!state || state !== storedState) {
    return NextResponse.redirect(new URL('/?error=invalid_state', request.url))
  }

  // Clear state cookie
  const response = NextResponse.redirect(new URL('/?success=connected', request.url))
  response.cookies.delete(`oauth_state_${platform}`)

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code', request.url))
  }

  try {
    let tokenData: { access_token: string; refresh_token?: string; expires_in?: number }
    let userInfo: { id: string; username?: string; name?: string }

    switch (platform) {
      case 'x': {
        // For X, we need the code verifier from the cookie
        const codeVerifier = request.cookies.get('x_code_verifier')?.value
        response.cookies.delete('x_code_verifier')
        
        if (!codeVerifier) {
          throw new Error('Missing code verifier for X')
        }
        
        tokenData = await xOAuthClient.exchangeCodeForTokenWithPKCE(code, codeVerifier)
        userInfo = await xOAuthClient.getUserInfo(tokenData.access_token)
        break
      }
      case 'linkedin': {
        tokenData = await linkedinOAuthClient.exchangeCodeForToken(code)
        const profile = await linkedinOAuthClient.getUserProfile(tokenData.access_token)
        userInfo = { id: profile.sub, username: profile.name }
        break
      }
      case 'meta': {
        const shortLivedToken = await metaOAuthClient.exchangeCodeForToken(code)
        // Exchange for long-lived token (60 days)
        tokenData = await metaOAuthClient.getLongLivedToken(shortLivedToken.access_token)
        const userData = await metaOAuthClient.getUserInfo(tokenData.access_token)
        userInfo = { id: userData.id, name: userData.name }
        break
      }
      default:
        throw new Error(`Unknown platform: ${platform}`)
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
    })

    if (!user) {
      throw new Error('User not found')
    }

    // Store or update social account
    await prisma.socialAccount.upsert({
      where: {
        userId_platform: {
          userId: user.id,
          platform: platform.toUpperCase() as 'X' | 'LINKEDIN' | 'FACEBOOK' | 'INSTAGRAM',
        },
      },
      create: {
        userId: user.id,
        platform: platform.toUpperCase() as 'X' | 'LINKEDIN' | 'FACEBOOK' | 'INSTAGRAM',
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        tokenExpiresAt: tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        scopes: [], // Could store scopes if needed
      },
      update: {
        platformUserId: userInfo.id,
        platformUsername: userInfo.username,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        tokenExpiresAt: tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        isActive: true,
      },
    })

    return response
  } catch (err) {
    console.error(`OAuth callback error for ${platform}:`, err)
    return NextResponse.redirect(new URL(`/?error=oauth_failed`, request.url))
  }
}