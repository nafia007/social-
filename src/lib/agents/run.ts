import { prisma } from '@/lib/prisma'
import { executeRun } from './runner'

/**
 * Trigger a single agent run immediately (manual "Run now").
 */
export async function runAgent(agentId: string): Promise<string> {
  const run = await executeRun(agentId)
  return run.id
}

/**
 * Cron entry: find active agents whose cadence is due and execute them.
 * Respects agent.cadenceHours since lastRunAt.
 */
export async function runDueAgents(): Promise<number> {
  const now = new Date()
  const agents = await prisma.agent.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, cadenceHours: true, lastRunAt: true },
  })

  let started = 0
  for (const a of agents) {
    const due = !a.lastRunAt || now.getTime() - a.lastRunAt.getTime() >= a.cadenceHours * 3600 * 1000
    if (!due) continue
    try {
      await executeRun(a.id, now)
      started++
    } catch (err) {
      console.error(`[agents] run failed for ${a.id}:`, (err as Error).message)
    }
  }
  return started
}
