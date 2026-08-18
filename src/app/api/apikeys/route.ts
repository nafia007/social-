import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { createApiKey } from '@/lib/auth/apikey'
import { z } from 'zod'

const createSchema = z.object({ name: z.string().min(1).max(50) })

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const team = orgId
    ? await prisma.team.findUnique({ where: { clerkOrgId: orgId } })
    : null

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id, ...(team ? { teamId: team.id } : { teamId: null }) },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  })

  return NextResponse.json({ keys })
}

export async function POST(request: Request) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const team = orgId
    ? await prisma.team.findUnique({ where: { clerkOrgId: orgId } })
    : null

  const body = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 })
  }

  const { key } = await createApiKey({
    name: parsed.data.name,
    userId: user.id,
    ...(team ? { teamId: team.id } : {}),
  })

  // The plaintext key is returned only once
  return NextResponse.json({ key }, { status: 201 })
}
