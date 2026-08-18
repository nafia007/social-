'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface Draft {
  id: string
  content: string
  platforms: string[]
  hashtags: string[]
  topic: string | null
  notes: string | null
  agentScore: number | null
  approval: string
  createdAt: string
  agent: { id: string; name: string }
  run?: { id: string; goal: string }
}

export default function ApprovalQueuePage() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents/drafts')
      const data = await res.json()
      setDrafts(data.drafts ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const action = async (draftId: string, act: 'approve' | 'reject', extra?: { editedContent?: string; reason?: string }) => {
    setBusy(true)
    try {
      await fetch('/api/agents/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: act, draftId, ...extra }),
      })
      setEditId(null); setReason('')
      load()
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Approval Queue</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Human-in-the-loop review. Approve agent drafts to schedule them, or reject.
          </p>
        </div>
        <Link href="/agents" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200">Back to agents</Link>
      </div>

      {loading ? (
        <div className="mt-8 space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg border bg-gray-100 dark:bg-gray-800" />)}
        </div>
      ) : drafts.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed p-12 text-center text-gray-500">🎉 Nothing to review. All caught up.</div>
      ) : (
        <div className="mt-6 space-y-4">
          {drafts.map((d) => (
            <div key={d.id} className="rounded-lg border bg-white p-4 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <Link href={`/agents/${d.agent.id}`} className="text-sm font-semibold text-gray-900 hover:underline dark:text-white">{d.agent.name}</Link>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  {d.agentScore != null && <span className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">score {d.agentScore}</span>}
                  <span>{new Date(d.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {editId === d.id ? (
                <>
                  <textarea className="mt-3 w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" rows={4} value={editContent} onChange={(e) => setEditContent(e.target.value)} />
                  <div className="mt-2 flex gap-2">
                    <button disabled={busy} onClick={() => action(d.id, 'approve', { editedContent: editContent })} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">Save & Approve</button>
                    <button onClick={() => setEditId(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{d.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {d.platforms.map((p) => <span key={p} className="rounded bg-gray-100 px-2 py-0.5 dark:bg-gray-800">{p}</span>)}
                    {d.hashtags?.map((h) => <span key={h} className="text-gray-400">#{h}</span>)}
                  </div>
                  {d.notes && <p className="mt-1 text-xs italic text-gray-500">Reviewer: {d.notes}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => action(d.id, 'approve')} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">Approve</button>
                    <button onClick={() => { setEditId(d.id); setEditContent(d.content) }} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-200">Edit</button>
                    <button disabled={busy} onClick={() => action(d.id, 'reject', { reason })} className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30">Reject</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
