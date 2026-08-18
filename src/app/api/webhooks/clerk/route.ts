import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import prisma from '@/lib/prisma'

interface ClerkWebhookEvent {
  type: string
  data: {
    id: string
    email_addresses?: Array<{ email_address: string; id: string }>
    primary_email_address_id?: string
    first_name?: string
    last_name?: string
    image_url?: string
    username?: string
  }
}

export async function POST(request: NextRequest) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  // Get the headers
  const svix_id = request.headers.get('svix-id')
  const svix_timestamp = request.headers.get('svix-timestamp')
  const svix_signature = request.headers.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  // Get the body
  const payload = await request.text()
  const body = JSON.parse(payload) as ClerkWebhookEvent

  // Verify the webhook
  const wh = new Webhook(WEBHOOK_SECRET)
  let evt: ClerkWebhookEvent

  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent
  } catch (err) {
    console.error('Webhook verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle the event
  const eventType = evt.type

  try {
    switch (eventType) {
      case 'user.created':
      case 'user.updated': {
        const { id, email_addresses, primary_email_address_id, first_name, last_name, image_url } = evt.data
        const primaryEmail = email_addresses?.find(
          (e) => e.id === primary_email_address_id
        )?.email_address || email_addresses?.[0]?.email_address

        const name = [first_name, last_name].filter(Boolean).join(' ') || null

        await prisma.user.upsert({
          where: { clerkUserId: id },
          create: {
            clerkUserId: id,
            email: primaryEmail || '',
            name,
            imageUrl: image_url,
          },
          update: {
            email: primaryEmail || '',
            name,
            imageUrl: image_url,
          },
        })
        break
      }

      case 'user.deleted': {
        const { id } = evt.data
        // Delete user and all related data (cascade)
        await prisma.user.delete({
          where: { clerkUserId: id },
        }).catch(() => {
          // User may not exist in our DB yet
        })
        break
      }

      case 'organization.created':
      case 'organization.updated': {
        const orgId = (evt.data as any).id
        if (orgId) {
          const { syncTeamFromClerk } = await import('@/lib/teams/sync')
          await syncTeamFromClerk(orgId).catch((e) => console.error('Team sync failed', e))
        }
        break
      }

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
      case 'organizationMembership.deleted': {
        const orgId = (evt.data as any).organization?.id
        if (orgId) {
          const { syncTeamFromClerk } = await import('@/lib/teams/sync')
          await syncTeamFromClerk(orgId).catch((e) => console.error('Team sync failed', e))
        }
        break
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Webhook processing error:', err)
    return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 })
  }
}