import { prisma } from '@/lib/prisma'

/**
 * Lightweight episodic/semantic memory for agents.
 * Used to inject past learnings, brand rules, and human feedback into prompts,
 * and to record performance so agents improve over time.
 */

export async function getMemories(agentId: string, kind?: string): Promise<string[]> {
  const rows = await prisma.agentMemory.findMany({
    where: { agentId, ...(kind ? { kind } : {}) },
    orderBy: { weight: 'desc' },
    take: 25,
  })
  return rows.map((r) => `[${r.kind}] ${r.content}`)
}

export async function addMemory(
  agentId: string,
  content: string,
  opts?: { kind?: string; source?: string; weight?: number }
): Promise<void> {
  await prisma.agentMemory.create({
    data: {
      agentId,
      content,
      kind: opts?.kind ?? 'learning',
      source: opts?.source,
      weight: opts?.weight ?? 1.0,
    },
  })
}

export async function recordFeedback(
  agentId: string,
  draftId: string,
  positive: boolean,
  note?: string
): Promise<void> {
  await addMemory(agentId, `Human ${positive ? 'approved' : 'rejected'} a draft${note ? `: ${note}` : ''}`, {
    kind: 'feedback',
    source: `draft:${draftId}`,
    weight: positive ? 1.2 : 0.8,
  })
}
