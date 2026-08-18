import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const feed = await prisma.rssFeed.findFirst({ where: { id, userId: user.id } })
  if (!feed) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.rssFeed.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
