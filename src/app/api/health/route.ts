import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Healthcheck endpoint for platform uptime monitors and load balancers.
 * Returns DB connectivity plus whether the worker is enabled in this process.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, string> = {}

  // Database
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  const allOk = Object.values(checks).every((s) => s === 'ok')
  const status = allOk ? 200 : 503

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      workerEnabled: process.env.RUN_WORKER !== 'false',
      checks,
    },
    { status }
  )
}
