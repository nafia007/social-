import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { syncTeamFromClerk } from '@/lib/teams/sync'

export async function POST(request: NextRequest) {
  try {
    const { userId, orgId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get orgId from auth context or request body
    let organizationId = orgId

    if (!organizationId) {
      const body = await request.json().catch(() => ({}))
      organizationId = body.orgId
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    const team = await syncTeamFromClerk(organizationId)

    return NextResponse.json({ team }, { status: 200 })
  } catch (err) {
    console.error('Team sync error:', err)
    return NextResponse.json({ error: 'Failed to sync team' }, { status: 500 })
  }
}