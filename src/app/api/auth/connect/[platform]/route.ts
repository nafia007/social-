import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { encrypt } from '@/lib/encryption'
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
  const state = crypto.randomUUID()

  // Store state in session/cookie for verification
  const response = NextResponse.redirect(
    getAuthUrl(platform, state)
  )
  
  response.cookies.set(`oauth_state_${platform}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
  })

  return response
}

function getAuthUrl(platform: string, state: string): string {
  switch (platform) {
    case 'x':
      return xOAuthClient.getAuthUrl(state)
    case 'linkedin':
      return linkedinOAuthClient.getAuthUrl(state)
    case 'meta':
      return metaOAuthClient.getAuthUrl(state)
    default:
      throw new Error(`Unknown platform: ${platform}`)
  }
}