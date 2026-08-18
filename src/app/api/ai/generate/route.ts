import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { generatePostVariants } from '@/lib/ai/generate'
import { AppError } from '@/lib/teams/rbac'

const schema = z.object({
  prompt: z.string().min(3).max(2000),
  count: z.number().int().min(1).max(10).optional(),
})

export async function POST(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const { prompt, count } = schema.parse(body)
    const variants = await generatePostVariants(prompt, count)
    return NextResponse.json({ variants })
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 })
    }
    console.error('AI generate error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}
