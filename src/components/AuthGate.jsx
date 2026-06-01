import { useMemo, useState } from 'react'
import {
  clearAdminUnlocked,
  hasConfiguredAdminPassword,
  isAdminUnlocked,
  setAdminUnlocked,
  verifyAdminPassword,
} from '../lib/adminAuth'
import { validateToken } from '../lib/github'

export default function AuthGate({ children, requireGitHubToken = true, fallbackToGitHubToken = true }) {
  const stored = localStorage.getItem('gh_pat')
  const passwordConfigured = useMemo(() => hasConfiguredAdminPassword(), [])
  const requiresGitHubToken = requireGitHubToken || (!passwordConfigured && fallbackToGitHubToken)

  const [password, setPassword] = useState('')
  const [passwordUnlocked, setPasswordUnlocked] = useState(() => (
    passwordConfigured ? isAdminUnlocked() : false
  ))
  const [pat, setPat] = useState(stored || '')
  const [tokenUnlocked, setTokenUnlocked] = useState(!!stored)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePasswordUnlock() {
    setLoading(true)
    setError('')

    try {
      const valid = await verifyAdminPassword(password)
      if (!valid) {
        setError('Password rejected.')
        return
      }

      setAdminUnlocked()
      setPasswordUnlocked(true)
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlock() {
    setLoading(true)
    setError('')

    try {
      const valid = await validateToken(pat)
      if (valid) {
        localStorage.setItem('gh_pat', pat)
        setTokenUnlocked(true)
      } else {
        setError('Token rejected - check it has Contents write access to this repo.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    clearAdminUnlocked()
    localStorage.removeItem('gh_pat')
    setPasswordUnlocked(false)
    setTokenUnlocked(false)
    setPat('')
    setPassword('')
    setError('')
  }

  if ((!passwordConfigured || passwordUnlocked) && (!requiresGitHubToken || tokenUnlocked)) {
    return children
  }

  const showPasswordPrompt = passwordConfigured && !passwordUnlocked
  const heading = showPasswordPrompt ? 'Admin access' : 'GitHub access'
  const helperText = showPasswordPrompt
    ? 'Enter the admin password to unlock protected tools.'
    : 'Enter your GitHub Personal Access Token for recipe changes.'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-lg font-semibold text-gray-700">{heading}</h2>
      <p className="text-sm text-gray-400 text-center max-w-sm">{helperText}</p>

      {showPasswordPrompt ? (
        <>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordUnlock()}
            className="border border-[#143109]/20 rounded px-3 py-2 w-80 text-sm
             focus:outline-none focus:ring-2 focus:ring-[#143109]/30"
          />
          <button
            onClick={handlePasswordUnlock}
            disabled={loading || !password}
            className="bg-[#143109] text-white px-6 py-2 rounded text-sm font-medium
             hover:opacity-90 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Checking…' : 'Unlock'}
          </button>
        </>
      ) : (
        <>
          <input
            type="password"
            placeholder="github_pat_..."
            value={pat}
            onChange={e => setPat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            className="border border-[#143109]/20 rounded px-3 py-2 w-80 font-mono text-sm
             focus:outline-none focus:ring-2 focus:ring-[#143109]/30"
          />
          <button
            onClick={handleUnlock}
            disabled={loading || !pat}
            className="bg-[#143109] text-white px-6 py-2 rounded text-sm font-medium
             hover:opacity-90 disabled:opacity-40 transition-colors"
          >
            {loading ? 'Checking…' : 'Unlock'}
          </button>
        </>
      )}

      {error && <p className="text-red-500 text-sm max-w-xs text-center">{error}</p>}

      {(passwordUnlocked || tokenUnlocked) && (
        <button
          onClick={handleLogout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Clear saved admin access
        </button>
      )}

      {showPasswordPrompt && (
        <p className="text-xs text-gray-300 max-w-sm text-center">
          Passwords are verified via a SHA-256 hash stored in the repo build config.
        </p>
      )}
    </div>
  )
}