import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { AppError } from '@/lib/teams/rbac'

export interface RequestContext {
  clerkUserId: string
  userId: string
  teamId?: string
}

/**
 * Resolve the current Clerk user to our DB user. Optionally scoped to a team
 * via the `teamId` header/query (set by the client when operating in org mode).
 */
export async function requireUser(teamId?: string): Promise<RequestContext> {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new AppError('Unauthorized', 401)

  const user = await prisma.user.findUnique({ where: { clerkUserId } })
  if (!user) throw new AppError('User not found', 404)

  let resolvedTeam: string | undefined = teamId
  if (teamId) {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
    })
    if (!membership) throw new AppError('Not a member of this team', 403)
  }

  return { clerkUserId, userId: user.id, teamId: resolvedTeam }
}
