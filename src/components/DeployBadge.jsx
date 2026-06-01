import { useEffect, useMemo, useRef, useState } from 'react'

const OWNER = 'tlkaufmann'
const REPO = 'cookbook'
const WORKFLOW = 'deploy.yml'
const RUNS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`
const MAIN_COMMIT_URL = `https://api.github.com/repos/${OWNER}/${REPO}/commits/main`

function statusFrom(run, latestMainSha) {
  if (!run) return { key: 'unknown', label: 'Deploy: unknown' }

  if (run.status !== 'completed') {
    return { key: 'running', label: 'Deploy: running' }
  }

  if (run.conclusion === 'success' && latestMainSha && run.head_sha && run.head_sha !== latestMainSha) {
    return { key: 'behind', label: 'Deploy: behind' }
  }

  switch (run.conclusion) {
    case 'success':
      return { key: 'success', label: 'Deploy: deployed' }
    case 'failure':
      return { key: 'failed', label: 'Deploy: failed' }
    case 'cancelled':
      return { key: 'cancelled', label: 'Deploy: cancelled' }
    default:
      return { key: 'unknown', label: `Deploy: ${run.conclusion || 'unknown'}` }
  }
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '-------'
}

export default function DeployBadge() {
  const [run, setRun] = useState(null)
  const [latestMainSha, setLatestMainSha] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const pat = localStorage.getItem('gh_pat')
        const headers = pat ? { Authorization: `token ${pat}` } : {}
        const [runsRes, mainRes] = await Promise.all([
          fetch(RUNS_URL, { cache: 'no-store', headers }),
          fetch(MAIN_COMMIT_URL, { cache: 'no-store', headers }),
        ])
        if (!runsRes.ok) throw new Error(`Workflow HTTP ${runsRes.status}`)
        if (!mainRes.ok) throw new Error(`Commit HTTP ${mainRes.status}`)
        const [runsData, mainData] = await Promise.all([runsRes.json(), mainRes.json()])
        if (!alive) return
        setRun((runsData.workflow_runs || [])[0] || null)
        setLatestMainSha(mainData.sha || '')
        setError('')
      } catch (e) {
        if (!alive) return
        setError(String(e.message || 'Failed to load deploy status'))
      }
    }

    load()
    const id = setInterval(load, 20000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const [expanded, setExpanded] = useState(false)
  const ref = useRef(null)

  const state = useMemo(() => statusFrom(run, latestMainSha), [run, latestMainSha])
  const sha = run?.head_sha

  const dotColor = {
    success: 'bg-emerald-500',
    running: 'bg-amber-400',
    behind: 'bg-blue-500',
    failed: 'bg-red-500',
    cancelled: 'bg-gray-400',
    unknown: 'bg-gray-400',
  }[state.key]

  const badgeCls = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    running: 'bg-amber-50 text-amber-800 border-amber-200',
    behind: 'bg-blue-50 text-blue-700 border-blue-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
    unknown: 'bg-gray-100 text-gray-700 border-gray-300',
  }[state.key]

  // Collapse when clicking outside
  useEffect(() => {
    if (!expanded) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setExpanded(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [expanded])

  if (!expanded) {
    return (
      <button
        ref={ref}
        onClick={() => setExpanded(true)}
        title={`Deploy status: ${state.label} · ${shortSha(sha)}`}
        className={`w-3 h-3 rounded-full ${dotColor} transition-transform hover:scale-125 focus:outline-none`}
      />
    )
  }

  return (
    <a
      ref={ref}
      href="https://github.com/tlkaufmann/cookbook/actions/workflows/deploy.yml"
      target="_blank"
      rel="noreferrer"
      className={`px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap ${badgeCls} transition-all`}
    >
      {state.label} · {shortSha(sha)}
    </a>
  )
}
