import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Dashboard } from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const { userId, isAuthenticated } = await auth()

  if (!isAuthenticated || !userId) {
    redirect('/sign-in')
  }

  return <Dashboard userId={userId} />
}
