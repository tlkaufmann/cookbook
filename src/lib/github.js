const OWNER = 'tlkaufmann'
const REPO = 'cookbook'
const BRANCH = 'main'

function token() {
  return localStorage.getItem('gh_pat')
}

// --- GitHub API (authenticated, used for writes and SHA retrieval) ---

async function readFile(path) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    { headers: { Authorization: `token ${token()}` }, cache: 'no-store' }
  )
  if (res.status === 404) {
    return { data: [], sha: null }
  }
  if (!res.ok) throw new Error(`GitHub read failed: ${path} (${res.status})`)
  const { content, sha } = await res.json()
  return { data: JSON.parse(atob(content)), sha }
}

async function writeFile(path, data, sha, message) {
  // btoa + URI encoding handles special characters (accents, umlauts, emoji)
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))))
  const body = { message, content: encoded, branch: BRANCH }
  if (sha) body.sha = sha // omit SHA when creating a new file
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `GitHub write failed: ${path}`)
  }
  return res.json() // returns { content: { sha: "new-sha" }, commit: {...} }
}

// --- Public static fetches (no auth, for reading in browse/shopping views) ---

export async function fetchRecipes() {
  const res = await fetch(`${import.meta.env.BASE_URL}recipes.json?t=${Date.now()}`)
  if (!res.ok) return []
  return res.json()
}

// --- Authenticated API access (for planner and recipe form writes) ---

export const getRecipes = () => readFile('public/recipes.json')

// Per-file write queues — serialize concurrent writes to prevent SHA conflicts.
// Each enqueued update reads a fresh SHA immediately before writing, so rapid
// successive saves never collide even if the previous commit just landed.
const writeQueues = {}

function enqueueUpdate(path, updateFn) {
  if (!writeQueues[path]) writeQueues[path] = Promise.resolve()
  const next = writeQueues[path].then(async () => {
    const { data, sha } = await readFile(path)
    const newData = await updateFn(data)
    return writeFile(path, newData, sha, `Update ${path.split('/').pop()}`)
  })
  // Don't let a failure poison the queue for future writes
  writeQueues[path] = next.catch(() => {})
  return next
}

export const updateRecipes = (fn) => enqueueUpdate('public/recipes.json', fn)

// --- Auth validation ---

export async function validateToken(pat) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}`,
    { headers: { Authorization: `token ${pat}` } }
  )
  return res.ok
}