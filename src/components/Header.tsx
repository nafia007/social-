'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { SignInButton, UserButton } from '@clerk/nextjs'
import Link from 'next/link'

export function Header() {
  const { user, isLoaded } = useUser()
  const isAuthenticated = isLoaded && !!user
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
            Social Scheduler
          </Link>
          
          <nav className="hidden md:flex items-center gap-6" role="navigation" aria-label="Main navigation">
            <Link href="/" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              Dashboard
            </Link>
            <Link href="/posts" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              Posts
            </Link>
            <Link href="/accounts" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              Accounts
            </Link>
            <Link href="/agents" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
              Agents
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <UserButton afterSignOutUrl="/" />
            </>
          ) : (
            <>
              <SignInButton mode="modal">Sign in</SignInButton>
              <Link
                href="/sign-up"
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Get Started
              </Link>
            </>
          )}
          
          <button
            className="md:hidden p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t bg-white dark:bg-gray-900 px-4 py-4">
          <nav className="flex flex-col gap-4" role="navigation" aria-label="Mobile navigation">
            <Link href="/" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Dashboard
            </Link>
            <Link href="/posts" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Posts
            </Link>
            <Link href="/accounts" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Accounts
            </Link>
            <Link href="/agents" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Agents
            </Link>
            <div className="pt-4 border-t">
              <UserButton afterSignOutUrl="/" />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}