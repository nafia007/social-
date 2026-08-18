import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { WebhookProvider, Prisma } from '@prisma/client'
import crypto from 'crypto'

/**
 * Verify X (Twitter) webhook signature
 * Uses HMAC-SHA256 with X_CLIENT_SECRET over "crypto.twitter.com" + body
 * Signature is sent as base64 in x-twitter-webhooks-signature header
 */
function verifyXSignature(payload: string, signature: string): boolean {
  const clientSecret = process.env.X_CLIENT_SECRET

  if (!clientSecret) {
    console.error('X_CLIENT_SECRET not configured')
    return false
  }

  // X signs the string "crypto.twitter.com" + body
  const signingString = 'crypto.twitter.com' + payload

  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(signingString, 'utf8')
    .digest('base64')

  // Timing-safe comparison
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
}

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text()

    // Get signature from headers
    const signature = request.headers.get('x-twitter-webhooks-signature')

    if (!signature) {
      console.warn('Missing x-twitter-webhooks-signature header')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    // Verify signature
    if (!verifyXSignature(rawBody, signature)) {
      console.warn('Invalid X webhook signature')
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
        provider: WebhookProvider.X,
        eventType: ((payload as Record<string, unknown>).event_type as string) || 'unknown',
        payload: payload as Prisma.InputJsonValue,
        signature,
        processed: false,
      },
    })

    // Quick response - process asynchronously
    return NextResponse.json({ success: true, eventId: webhookEvent.id })
  } catch (error) {
    console.error('X webhook error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * X webhook CRC (Challenge Response Check) endpoint (GET)
 * Used during webhook registration to verify the endpoint
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const crcToken = searchParams.get('crc_token')

  if (!crcToken) {
    return NextResponse.json({ error: 'Missing crc_token' }, { status: 400 })
  }

  const clientSecret = process.env.X_CLIENT_SECRET

  if (!clientSecret) {
    console.error('X_CLIENT_SECRET not configured')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  // Generate response token: HMAC-SHA256 of crc_token with consumer secret, base64 encoded
  const responseToken = crypto
    .createHmac('sha256', clientSecret)
    .update(crcToken, 'utf8')
    .digest('base64')

  return NextResponse.json({ response_token: `sha256=${responseToken}` })
}