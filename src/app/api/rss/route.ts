import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { Platform } from '@prisma/client'

const schema = z.object({
  url: z.string().url(),
  platforms: z.array(z.enum(['X', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK'])).min(1),
  autoPost: z.boolean().optional(),
  cadenceHours: z.number().int().min(1).max(720).optional(),
})

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const team = orgId ? await prisma.team.findUnique({ where: { clerkOrgId: orgId } }) : null

  const feeds = await prisma.rssFeed.findMany({
    where: { userId: user.id, ...(team ? { teamId: team.id } : { teamId: null }) },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ feeds })
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const team = orgId ? await prisma.team.findUnique({ where: { clerkOrgId: orgId } }) : null

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors }, { status: 400 })

  const feed = await prisma.rssFeed.create({
    data: {
      userId: user.id,
      teamId: team?.id,
      url: parsed.data.url,
      platforms: parsed.data.platforms as Platform[],
      autoPost: parsed.data.autoPost ?? false,
      cadenceHours: parsed.data.cadenceHours ?? 24,
    },
  })
  return NextResponse.json({ feed }, { status: 201 })
}
