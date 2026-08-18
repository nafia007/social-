import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { generateHashtags } from '@/lib/ai/generate'
import { AppError } from '@/lib/teams/rbac'

const schema = z.object({ text: z.string().min(1).max(5000) })

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { text } = schema.parse(await request.json())
    const hashtags = await generateHashtags(text)
    return NextResponse.json({ hashtags })
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 })
    return NextResponse.json({ error: 'Hashtag generation failed' }, { status: 500 })
  }
}
