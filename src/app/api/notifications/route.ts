import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { markRead } from '@/lib/notify/notify'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ])

  return NextResponse.json({ notifications, unread })
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  await markRead(user.id, body?.ids)
  return NextResponse.json({ ok: true })
}
