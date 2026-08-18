'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface SocialAccount {
  id: string
  platform: 'X' | 'LINKEDIN' | 'INSTAGRAM' | 'FACEBOOK'
  platformUsername: string | null
  isActive: boolean
  createdAt: string
}

export function AccountCard() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('Failed to fetch accounts')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = (platform: string) => {
    window.location.href = `/api/auth/connect/${platform.toLowerCase()}`
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this account?')) return

    try {
      const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      fetchAccounts()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to disconnect')
    }
  }

  const platforms = [
    { id: 'X', name: 'X (Twitter)', color: 'bg-black', icon: <XIcon /> },
    { id: 'LINKEDIN', name: 'LinkedIn', color: 'bg-blue-600', icon: <LinkedInIcon /> },
    { id: 'INSTAGRAM', name: 'Instagram', color: 'bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400', icon: <InstagramIcon /> },
    { id: 'FACEBOOK', name: 'Facebook', color: 'bg-blue-700', icon: <FacebookIcon /> },
  ] as const

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 h-32" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Connected Accounts</h2>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {platforms.map((platform) => {
          const account = accounts.find((a) => a.platform === platform.id)
          return (
            <AccountPlatformCard
              key={platform.id}
              platform={platform}
              account={account || null}
              onConnect={() => handleConnect(platform.id)}
              onDisconnect={() => account && handleDisconnect(account.id)}
            />
          )
        })}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            No accounts connected yet. Click "Connect" on any platform above to get started.
          </p>
        </div>
      )}
    </div>
  )
}

interface AccountPlatformCardProps {
  platform: { id: string; name: string; color: string; icon: React.ReactNode }
  account: SocialAccount | null
  onConnect: () => void
  onDisconnect: () => void
}

function AccountPlatformCard({ platform, account, onConnect, onDisconnect }: AccountPlatformCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${platform.color}`}>
          {platform.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{platform.name}</h3>
          {account ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
              @{account.platformUsername || account.platform}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">Not connected</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        {account ? (
          <>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              account.isActive
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              {account.isActive ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={onDisconnect}
              className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Connect {platform.name}
          </button>
        )}
      </div>
    </div>
  )
}

// Platform icons
function XIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-.126-.312-.535-1.596-1.464-2.27-.05-.022-.104-.044-.16-.066-.395-.155-1.333-.599-2.6-.958-.355-.098-.716-.198-1.077-.298-.173-.048-.347-.097-.523-.146-.683-.194-1.586-.465-2.7-.465zm0 3.72c1.234 0 2.242 1.003 2.497 2.238.275 1.325.271 2.905-.03 4.232-2.337.637-4.586 1.371-6.51 1.371-1.926 0-4.175-.734-6.51-1.371-.3-.577-.301-1.79-.03-3.523.255-1.235 1.263-2.238 2.497-2.238 1.233 0 2.24 1.003 2.496 2.237.505 1.737 2.02 3.17 3.985 3.17 1.966 0 3.48-1.433 3.985-3.17zM17.664 6.263c0-1.409-1.145-2.553-2.554-2.553-1.41 0-2.554 1.144-2.554 2.553 0 1.41 1.144 2.553 2.554 2.553 1.409 0 2.554-1.143 2.554-2.553zm-10.89 5.405c0 3.008 2.437 5.446 5.446 5.446 3.009 0 5.446-2.438 5.446-5.446 0-3.009-2.437-5.447-5.446-5.447-3.008 0-5.446 2.438-5.446 5.447z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}