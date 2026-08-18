'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Step { type: string; status: string; order: number; output: any; error: string | null; tokensUsed: number | null; model: string | null }
interface Run { id: string; status: string; goal: string; createdAt: string; error: string | null; steps: Step[]; _count: { drafts: number } }
interface Draft { id: string; content: string; platforms: string[]; hashtags: string[]; topic: string | null; notes: string | null; agentScore: number | null; approval: string; createdAt: string }

const RUN_STATUS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  RUNNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  AWAITING_APPROVAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}
const STEP_ICON: Record<string, string> = { DONE: '✓', FAILED: '✗', RUNNING: '◌', PENDING: '•', SKIPPED: '–' }

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params.id
  const [agent, setAgent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ id: string; content: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/agents/${id}`)
      const data = await res.json()
      setAgent(data.agent)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const runNow = async () => { await fetch(`/api/agents/${id}/run`, { method: 'POST' }); load() }

  const toggleStatus = async () => {
    const next = agent.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    await fetch(`/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) })
    load()
  }

  const remove = async () => {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    router.push('/agents')
  }

  const approve = async (draftId: string, editedContent?: string) => {
    setBusy(true)
    try {
      await fetch('/api/agents/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', draftId, editedContent }),
      })
      setEditDraft(null)
      load()
    } finally { setBusy(false) }
  }
  const reject = async (draftId: string) => {
    setBusy(true)
    try {
      await fetch('/api/agents/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', draftId }),
      })
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <div className="mx-auto max-w-5xl px-4 py-12 text-gray-500">Loading…</div>
  if (!agent) return <div className="mx-auto max-w-5xl px-4 py-12 text-red-500">Agent not found.</div>

  const pendingDrafts = (agent.drafts ?? []).filter((d: Draft) => d.approval === 'PENDING')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/agents" className="text-sm text-gray-500 hover:underline">← All agents</Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{agent.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">{agent.goal}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {agent.platforms.map((p: string) => (
              <span key={p} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{p}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleStatus} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            {agent.status === 'ACTIVE' ? 'Pause' : 'Activate'}
          </button>
          <button onClick={runNow} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700">Run now</button>
          <button onClick={remove} className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30">Delete</button>
        </div>
      </div>

      {/* Config */}
      <section className="mt-6 rounded-lg border bg-white p-4 dark:bg-gray-900">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Configuration</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-400">Type</dt><dd className="text-gray-800 dark:text-gray-200">{agent.type}</dd></div>
          <div><dt className="text-gray-400">Tone</dt><dd className="text-gray-800 dark:text-gray-200">{agent.tone}</dd></div>
          <div><dt className="text-gray-400">Cadence</dt><dd className="text-gray-800 dark:text-gray-200">every {agent.cadenceHours}h</dd></div>
          <div><dt className="text-gray-400">Auto-publish</dt><dd className="text-gray-800 dark:text-gray-200">{agent.autoPublish ? 'Yes' : 'No (needs approval)'}</dd></div>
          <div><dt className="text-gray-400">Model</dt><dd className="text-gray-800 dark:text-gray-200">{agent.model}</dd></div>
          <div><dt className="text-gray-400">Runs</dt><dd className="text-gray-800 dark:text-gray-200">{agent.runCount}</dd></div>
          <div className="col-span-2 sm:col-span-3"><dt className="text-gray-400">Topics</dt><dd className="text-gray-800 dark:text-gray-200">{agent.topics?.join(', ') || '—'}</dd></div>
          <div className="col-span-2 sm:col-span-3"><dt className="text-gray-400">Hashtags</dt><dd className="text-gray-800 dark:text-gray-200">{agent.hashtags?.map((h: string) => `#${h}`).join(' ') || '—'}</dd></div>
        </dl>
      </section>

      {/* Pending drafts (human-in-the-loop) */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Pending Drafts ({pendingDrafts.length})</h2>
        {pendingDrafts.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No drafts awaiting approval.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {pendingDrafts.map((d: Draft) => (
              <div key={d.id} className="rounded-lg border bg-white p-4 dark:bg-gray-900">
                {editDraft?.id === d.id ? (
                  <>
                    <textarea className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" rows={4} value={editDraft.content} onChange={(e) => setEditDraft({ id: d.id, content: e.target.value })} />
                    <div className="mt-2 flex gap-2">
                      <button disabled={busy} onClick={() => approve(d.id, editDraft.content)} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">Save & Approve</button>
                      <button onClick={() => setEditDraft(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{d.content}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      {d.platforms.map((p) => <span key={p} className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">{p}</span>)}
                      {d.agentScore != null && <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">score {d.agentScore}</span>}
                    </div>
                    {d.notes && <p className="mt-1 text-xs italic text-gray-500">Reviewer: {d.notes}</p>}
                    <div className="mt-3 flex gap-2">
                      <button disabled={busy} onClick={() => approve(d.id)} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">Approve</button>
                      <button onClick={() => setEditDraft({ id: d.id, content: d.content })} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">Edit</button>
                      <button disabled={busy} onClick={() => reject(d.id)} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30">Reject</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Runs */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Runs</h2>
        {!agent.runs?.length ? (
          <p className="mt-2 text-sm text-gray-500">No runs yet. Click “Run now”.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {agent.runs.map((run: Run) => (
              <div key={run.id} className="rounded-lg border bg-white p-4 dark:bg-gray-900">
                <button onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)} className="flex w-full items-center justify-between text-left">
                  <span className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RUN_STATUS[run.status] || ''}`}>{run.status}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">{new Date(run.createdAt).toLocaleString()}</span>
                  </span>
                  <span className="text-xs text-gray-400">{run.steps.length} steps ▾</span>
                </button>
                {expandedRun === run.id && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {run.steps.map((s) => (
                      <div key={s.order} className="text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-4 text-center">{STEP_ICON[s.status] || '•'}</span>
                          <span className="font-medium text-gray-800 dark:text-gray-100">{s.type}</span>
                          <span className="text-xs text-gray-400">{s.model}{s.tokensUsed ? ` · ${s.tokensUsed} tok` : ''}</span>
                        </div>
                        {s.error && <p className="ml-6 text-xs text-red-500">{s.error}</p>}
                        {s.output && (
                          <pre className="ml-6 mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{JSON.stringify(s.output, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                    {run.error && <p className="text-xs text-red-500">Run error: {run.error}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
