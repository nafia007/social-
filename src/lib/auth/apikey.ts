import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/teams/rbac'

/**
 * Generate a new API key for a user or team.
 * Returns the plaintext key ONCE (never stored). Only a hash + prefix are persisted.
 */
export async function createApiKey(opts: {
  name: string
  userId?: string
  teamId?: string
}): Promise<{ key: string; prefix: string }> {
  const raw = crypto.randomBytes(32).toString('hex')
  const prefix = raw.slice(0, 8)
  const keyHash = crypto.createHash('sha256').update(raw).digest('hex')

  await prisma.apiKey.create({
    data: {
      name: opts.name,
      userId: opts.userId,
      teamId: opts.teamId,
      keyHash,
      prefix,
    },
  })

  return { key: `sk_live_${raw}`, prefix }
}

/**
 * Validate an API key (Bearer token). Returns the owning user/team or throws.
 */
export async function validateApiKey(token: string): Promise<{
  userId?: string
  teamId?: string
} | null> {
  if (!token.startsWith('sk_live_')) return null
  const raw = token.replace('sk_live_', '')
  const keyHash = crypto.createHash('sha256').update(raw).digest('hex')

  const key = await prisma.apiKey.findUnique({ where: { keyHash } })
  if (!key) return null
  if (key.expiresAt && key.expiresAt < new Date()) return null

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {})

  return { userId: key.userId ?? undefined, teamId: key.teamId ?? undefined }
}

/**
 * Resolve identity from either Clerk session or API key.
 * Returns { userId?, teamId? } or null.
 */
export async function resolveIdentity(req: Request): Promise<{ userId?: string; teamId?: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    // API key
    const api = await validateApiKey(token)
    if (api) return api
  }

  // Clerk session (lazy import to avoid pulling server-only in worker contexts)
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (userId) {
      const user = await prisma.user.findUnique({ where: { clerkUserId: userId } })
      return user ? { userId: user.id } : null
    }
  } catch {
    // Not in a Clerk request context
  }
  return null
}

export { AppError }
