export class AppError extends Error {
  public readonly status: number
  public readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError(message, 403, 'FORBIDDEN')
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(message, 404, 'NOT_FOUND')
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED')
  }

  static badRequest(message = 'Bad request'): AppError {
    return new AppError(message, 400, 'BAD_REQUEST')
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR')
  }
}

import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { MembershipRole } from '@prisma/client'

export async function requireTeamRole(
  teamId: string,
  allowedRoles: MembershipRole[]
): Promise<{ userId: string; role: MembershipRole }> {
  const { userId } = await auth()

  if (!userId) {
    throw AppError.unauthorized('Authentication required')
  }

  // Find the user in our database
  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  })

  if (!user) {
    throw AppError.notFound('User not found')
  }

  // Check team membership
  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId,
      },
    },
  })

  if (!membership) {
    throw AppError.forbidden('Not a member of this team')
  }

  if (!allowedRoles.includes(membership.role)) {
    throw AppError.forbidden(`Required role: ${allowedRoles.join(' or ')}, current: ${membership.role}`)
  }

  return { userId: user.id, role: membership.role }
}

export async function getTeamMembership(
  teamId: string
): Promise<{ userId: string; role: MembershipRole } | null> {
  const { userId } = await auth()

  if (!userId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId: userId },
  })

  if (!user) {
    return null
  }

  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId,
      },
    },
  })

  if (!membership) {
    return null
  }

  return { userId: user.id, role: membership.role }
}