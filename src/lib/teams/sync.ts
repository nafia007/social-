import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import { MembershipRole, Team } from '@prisma/client'

export async function syncTeamFromClerk(clerkOrgId: string): Promise<Team> {
  const clerk = await clerkClient()

  // Get organization from Clerk
  const clerkOrg = await clerk.organizations.getOrganization({ organizationId: clerkOrgId })

  // Upsert Team
  const team = await prisma.team.upsert({
    where: { clerkOrgId },
    create: {
      clerkOrgId,
      name: clerkOrg.name,
      slug: clerkOrg.slug || clerkOrgId,
      imageUrl: clerkOrg.imageUrl || null,
      plan: 'free',
    },
    update: {
      name: clerkOrg.name,
      slug: clerkOrg.slug || clerkOrgId,
      imageUrl: clerkOrg.imageUrl || null,
    },
  })

  // Sync memberships
  const memberships = await clerk.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
  })

  for (const membership of memberships.data) {
    const clerkUserId = membership.publicUserData?.userId
    if (!clerkUserId) continue

    // Ensure user exists in our DB
    let user = await prisma.user.findUnique({
      where: { clerkUserId },
    })

    if (!user) {
      // Fetch user details from Clerk
      const clerkUser = await clerk.users.getUser(clerkUserId)
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress || clerkUser.emailAddresses[0]?.emailAddress
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null

      user = await prisma.user.create({
        data: {
          clerkUserId,
          email: primaryEmail || '',
          name,
          imageUrl: clerkUser.imageUrl || null,
        },
      })
    }

    // Map Clerk role to our MembershipRole
    let role: MembershipRole = 'MEMBER'
    if (membership.role === 'org:owner') role = 'OWNER'
    else if (membership.role === 'org:admin') role = 'ADMIN'

    // Upsert TeamMembership
    await prisma.teamMembership.upsert({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId: team.id,
        },
      },
      create: {
        userId: user.id,
        teamId: team.id,
        role,
        clerkUserId,
      },
      update: {
        role,
        clerkUserId,
      },
    })
  }

  return team
}