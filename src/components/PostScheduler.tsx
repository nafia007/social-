'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface ConnectedAccount {
  platform: 'X' | 'LINKEDIN' | 'INSTAGRAM' | 'FACEBOOK'
  platformUsername: string | null
}

const PLATFORMS = [
  { id: 'X', name: 'X (Twitter)', color: 'bg-black', icon: <XIcon /> },
  { id: 'LINKEDIN', name: 'LinkedIn', color: 'bg-blue-600', icon: <LinkedInIcon /> },
  { id: 'INSTAGRAM', name: 'Instagram', color: 'bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400', icon: <InstagramIcon /> },
  { id: 'FACEBOOK', name: 'Facebook', color: 'bg-blue-700', icon: <FacebookIcon /> },
] as const

export function PostScheduler() {
  const [content, setContent] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [scheduleNow, setScheduleNow] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('Failed to fetch accounts')
      const data = await res.json()
      const connected = data.accounts
        .filter((a: any) => a.isActive)
        .map((a: any) => ({ platform: a.platform, platformUsername: a.platformUsername }))
      setAccounts(connected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    if (content.trim().length === 0) {
      setError('Post content cannot be empty')
      setSubmitting(false)
      return
    }

    if (selectedPlatforms.length === 0) {
      setError('Please select at least one platform')
      setSubmitting(false)
      return
    }

    if (!scheduleNow && !scheduledAt) {
      setError('Please select a date and time to schedule the post')
      setSubmitting(false)
      return
    }

    // Validation: Instagram requires media
    if (selectedPlatforms.includes('INSTAGRAM') && content.trim().length === 0) {
      // In a real app, you'd enforce media upload for Instagram
    }

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          platforms: selectedPlatforms,
          scheduledAt: scheduleNow ? undefined : new Date(scheduledAt).toISOString(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create post')
      }

      const data = await res.json()
      setSuccess(
        scheduleNow
          ? 'Post scheduled for immediate publishing!'
          : 'Post scheduled successfully!'
      )
      setContent('')
      setSelectedPlatforms([])
      setScheduledAt('')

      // Refresh posts list
      setTimeout(() => router.refresh(), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 h-64" />
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You need to connect at least one social media account before scheduling posts.
        </p>
        <a
          href="/accounts"
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Connect an Account
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Schedule a Post</h2>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded-lg mb-4">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Post Content
            </label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="What would you like to share?"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-gray-900 dark:focus:border-white focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {content.length}/10000 characters
            </p>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Platforms
            </label>
            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.filter((p) =>
                accounts.some((a) => a.platform === p.id)
              ).map((platform) => (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => togglePlatform(platform.id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedPlatforms.includes(platform.id)
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${platform.color}`}>
                    {platform.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{platform.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {accounts.find((a) => a.platform === platform.id)?.platformUsername || ''}
                    </p>
                  </div>
                  {selectedPlatforms.includes(platform.id) && (
                    <svg className="h-5 w-5 text-gray-900 dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduling */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              When to Publish
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="schedule"
                  checked={scheduleNow}
                  onChange={() => setScheduleNow(true)}
                  className="h-4 w-4 text-gray-900 focus:ring-gray-900"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Publish immediately</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="radio"
                  name="schedule"
                  checked={!scheduleNow}
                  onChange={() => setScheduleNow(false)}
                  className="h-4 w-4 text-gray-900 focus:ring-gray-900"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Schedule for later</span>
              </label>
              {!scheduleNow && (
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-gray-900 dark:focus:border-white focus:outline-none"
                />
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {submitting ? 'Scheduling...' : scheduleNow ? 'Publish Now' : 'Schedule Post'}
          </button>
        </form>
      </div>
    </div>
  )
}

// Platform icons (same as AccountCard)
function XIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-.126-.312-.535-1.596-1.464-2.27-.05-.022-.104-.044-.16-.066-.395-.155-1.333-.599-2.6-.958-.355-.098-.716-.198-1.077-.298-.173-.048-.347-.097-.523-.146-.683-.194-1.586-.465-2.7-.465zm0 3.72c1.234 0 2.242 1.003 2.497 2.238.275 1.325.271 2.905-.03 4.232-2.337.637-4.586 1.371-6.51 1.371-1.926 0-4.175-.734-6.51-1.371-.3-.577-.301-1.79-.03-3.523.255-1.235 1.263-2.238 2.497-2.238 1.233 0 2.24 1.003 2.496 2.237.505 1.737 2.02 3.17 3.985 3.17 1.966 0 3.48-1.433 3.985-3.17zM17.664 6.263c0-1.409-1.145-2.553-2.554-2.553-1.41 0-2.554 1.144-2.554 2.553 0 1.41 1.144 2.553 2.554 2.553 1.409 0 2.554-1.143 2.554-2.553zm-10.89 5.405c0 3.008 2.437 5.446 5.446 5.446 3.009 0 5.446-2.438 5.446-5.446 0-3.009-2.437-5.447-5.446-5.447-3.008 0-5.446 2.438-5.446 5.447z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}