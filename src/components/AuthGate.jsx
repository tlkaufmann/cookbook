import { useState } from 'react'
import { validateToken } from '../lib/github'

export default function AuthGate({ children }) {
  const stored = localStorage.getItem('gh_pat')
  const [pat, setPat] = useState(stored || '')
  const [unlocked, setUnlocked] = useState(!!stored)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUnlock() {
    setLoading(true)
    setError('')
    const valid = await validateToken(pat)
    setLoading(false)
    if (valid) {
      localStorage.setItem('gh_pat', pat)
      setUnlocked(true)
    } else {
      setError('Token rejected - check it has Contents write access to this repo.')
    }
  }

  if (unlocked) return children

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-lg font-semibold text-gray-700">Admin access</h2>
      <p className="text-sm text-gray-400">Enter your GitHub Personal Access Token</p>
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
      {error && <p className="text-red-500 text-sm max-w-xs text-center">{error}</p>}
      <p className="text-xs text-gray-300 mt-2">
        To log out: open browser console and run{' '}
        <code className="bg-gray-100 px-1 rounded">localStorage.removeItem('gh_pat')</code>
      </p>
    </div>
  )
}