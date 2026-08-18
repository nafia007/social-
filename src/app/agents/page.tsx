'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  description: string | null
  goal: string
  type: string
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT'
  tone: string
  topics: string[]
  hashtags: string[]
  platforms: string[]
  cadenceHours: number
  autoPublish: boolean
  model: string
  lastRunAt: string | null
  runCount: number
  _count: { runs: number; drafts: number }
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  PAUSED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      setAgents(data.agents ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runNow = async (id: string) => {
    await fetch(`/api/agents/${id}/run`, { method: 'POST' })
    load()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Agents</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Autonomous agents that plan, draft, and (optionally) publish content on a schedule.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/agents/queue" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Approval Queue
          </Link>
          <button onClick={() => setShowCreate(true)} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
            New Agent
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg border bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">No agents yet.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
            Create your first agent
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <div key={a.id} className="rounded-lg border bg-white p-4 dark:bg-gray-900">
              <div className="flex items-start justify-between">
                <Link href={`/agents/${a.id}`} className="text-lg font-semibold text-gray-900 hover:underline dark:text-white">
                  {a.name}
                </Link>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}>{a.status}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-300">{a.goal}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {a.platforms.map((p) => (
                  <span key={p} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{p}</span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>every {a.cadenceHours}h</span>
                <span>{a._count.runs} runs · {a._count.drafts} drafts</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/agents/${a.id}`} className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                  Open
                </Link>
                <button onClick={() => runNow(a.id)} className="flex-1 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700">
                  Run now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAgentModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} creating={creating} setCreating={setCreating} />
      )}
    </div>
  )
}

function CreateAgentModal({ onClose, onCreated, creating, setCreating }: {
  onClose: () => void
  onCreated: () => void
  creating: boolean
  setCreating: (v: boolean) => void
}) {
  const [form, setForm] = useState({
    name: '', goal: '', description: '', type: 'CONTENT_STRATEGIST', tone: 'professional',
    topics: '', hashtags: '', platforms: ['X'], cadenceHours: 24, autoPublish: false, model: '',
  })

  const togglePlatform = (p: string) =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }))

  const submit = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          topics: form.topics.split(',').map((s) => s.trim()).filter(Boolean),
          hashtags: form.hashtags.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean),
          model: form.model || undefined,
        }),
      })
      if (res.ok) onCreated()
    } finally {
      setCreating(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white'
  const PLATFORMS = ['X', 'LINKEDIN', 'INSTAGRAM', 'FACEBOOK']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-white p-6 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Content Agent</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Name</label>
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Growth Bot" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Goal</label>
            <textarea className={inputCls} rows={2} value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="Grow our X audience with daily AI tips" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Description (optional)</label>
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Type</label>
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['CONTENT_STRATEGIST', 'COPYWRITER', 'RESEARCHER', 'REVIEWER', 'SCHEDULER'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Tone</label>
              <input className={inputCls} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Platforms</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button key={p} type="button" onClick={() => togglePlatform(p)}
                  className={`rounded-md border px-3 py-1 text-sm ${form.platforms.includes(p) ? 'border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900' : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Topics (comma separated)</label>
              <input className={inputCls} value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} placeholder="AI, productivity" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Hashtags (comma separated)</label>
              <input className={inputCls} value={form.hashtags} onChange={(e) => setForm({ ...form, hashtags: e.target.value })} placeholder="#ai #growth" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Cadence (hours)</label>
              <input type="number" min={1} className={inputCls} value={form.cadenceHours} onChange={(e) => setForm({ ...form, cadenceHours: Number(e.target.value) })} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Model (optional)</label>
              <input className={inputCls} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o-mini" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={form.autoPublish} onChange={(e) => setForm({ ...form, autoPublish: e.target.checked })} />
            Auto-publish (skip human approval)
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">Cancel</button>
          <button onClick={submit} disabled={creating || !form.name || !form.goal}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
