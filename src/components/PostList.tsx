'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Post {
  id: string
  content: string
  platforms: string[]
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED'
  scheduledAt: string | null
  publishedAt: string | null
  errorMessage: string | null
  createdAt: string
}

const STATUS_COLORS = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  PUBLISHING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  PUBLISHED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
}

const PLATFORM_NAMES = {
  X: 'X',
  LINKEDIN: 'LinkedIn',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
}

export function PostList() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('ALL')
  const router = useRouter()

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/posts')
      if (!res.ok) throw new Error('Failed to fetch posts')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts')
    } finally {
      setLoading(false)
    }
  }

  const filteredPosts = filter === 'ALL' 
    ? posts 
    : posts.filter((p) => p.status === filter)

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 h-24" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You haven&apos;t created any posts yet.
        </p>
        <a
          href="/schedule"
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Create Your First Post
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {['ALL', 'SCHEDULED', 'PUBLISHED', 'FAILED'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === status
                ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Posts */}
      {filteredPosts.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}

      {filteredPosts.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No posts with status &quot;{filter}&quot;
        </div>
      )}
    </div>
  )
}

function PostItem({ post }: { post: Post }) {
  const formattedDate = post.scheduledAt
    ? new Date(post.scheduledAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : post.publishedAt
    ? new Date(post.publishedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : new Date(post.createdAt).toLocaleDateString()

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[post.status]}`}>
              {post.status}
            </span>
            {post.platforms.map((platform) => (
              <span
                key={platform}
                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {PLATFORM_NAMES[platform as keyof typeof PLATFORM_NAMES] || platform}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap line-clamp-3">
            {post.content}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {post.status === 'SCHEDULED' && `Scheduled for ${formattedDate}`}
            {post.status === 'PUBLISHED' && `Published ${formattedDate}`}
            {post.status === 'DRAFT' && `Created ${formattedDate}`}
            {post.status === 'FAILED' && `Failed ${formattedDate}`}
          </p>
          {post.status === 'FAILED' && post.errorMessage && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              Error: {post.errorMessage.substring(0, 200)}
              {post.errorMessage.length > 200 ? '...' : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}