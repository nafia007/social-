import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WebhookProvider, Prisma } from '@prisma/client'
import crypto from 'crypto'

/**
 * Verify Meta (Facebook/Instagram) webhook signature
 * Uses HMAC-SHA256 with META_APP_SECRET
 */
function verifyMetaSignature(payload: string, signature: string): boolean {
  const appSecret = process.env.META_APP_SECRET

  if (!appSecret) {
    console.error('META_APP_SECRET not configured')
    return false
  }

  // Meta sends signature as "sha256=<hash>"
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload, 'utf8')
    .digest('hex')

  const providedSignature = signature.replace('sha256=', '')

  // Timing-safe comparison
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(providedSignature))
}

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Get signature from headers
    const signature = request.headers.get('x-hub-signature-256')

    if (!signature) {
      console.warn('Missing x-hub-signature-256 header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    // Verify signature
    if (!verifyMetaSignature(rawBody, signature)) {
      console.warn('Invalid Meta webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse the JSON payload
    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Store the webhook event
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        provider: WebhookProvider.META,
        eventType: ((payload as Record<string, unknown>).object as string) || 'unknown',
        payload: payload as Prisma.InputJsonValue,
        signature,
        processed: false,
      },
    })

    // Quick response - process asynchronously
    return NextResponse.json({ success: true, eventId: webhookEvent.id })
  } catch (error) {
    console.error('Meta webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Meta webhook verification endpoint (GET)
 * Used during webhook setup to verify the endpoint
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN

  if (!verifyToken) {
    console.error('META_WEBHOOK_VERIFY_TOKEN not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Meta webhook verified')
    return new NextResponse(challenge || '', { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}