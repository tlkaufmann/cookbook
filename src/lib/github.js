const OWNER = 'tlkaufmann'
const REPO = 'cookbook'
const BRANCH = 'main'

const MOJIBAKE_PATTERN = /Ã.|Â.|â[\u0080-\u00BF]/

function looksMojibake(value) {
  return typeof value === 'string' && MOJIBAKE_PATTERN.test(value)
}

function decodeLatin1AsUtf8(value) {
  try {
    const bytes = new Uint8Array([...value].map(ch => ch.charCodeAt(0) & 0xff))
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return value
  }
}

function fixMojibakeText(value) {
  if (!looksMojibake(value)) return value

  let next = value
  for (let i = 0; i < 2; i += 1) {
    const decoded = decodeLatin1AsUtf8(next)
    if (decoded === next) break
    next = decoded
    if (!looksMojibake(next)) break
  }

  // Final safety replacements for common quote/dash artifacts.
  return next
    .replace(/â€™/g, "'")
    .replace(/â€˜/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, '-')
    .replace(/â€”/g, '-')
    .replace(/Â/g, '')
}

function normalizeTextDeep(value) {
  if (typeof value === 'string') return fixMojibakeText(value)
  if (Array.isArray(value)) return value.map(normalizeTextDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, normalizeTextDeep(val)])
    )
  }
  return value
}

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
  return { data: normalizeTextDeep(JSON.parse(atob(content))), sha }
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
    const e = new Error(err.message || `GitHub write failed: ${path}`)
    e.status = res.status
    throw e
  }
  return res.json() // returns { content: { sha: "new-sha" }, commit: {...} }
}

function isShaConflict(error) {
  if (!error) return false
  if (error.status === 409) return true
  const msg = String(error.message || '')
  return msg.includes(' is at ') && msg.includes(' but expected ')
}

// --- Public static fetches (no auth, for reading in browse/shopping views) ---

export async function fetchRecipes() {
  const res = await fetch(`${import.meta.env.BASE_URL}recipes.json?t=${Date.now()}`)
  if (!res.ok) return []
  const data = await res.json()
  return normalizeTextDeep(data)
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
    // Retry a few times on SHA mismatch to handle concurrent writes from
    // another client/tab/process between read and write.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { data, sha } = await readFile(path)
      const newData = normalizeTextDeep(await updateFn(normalizeTextDeep(data)))
      try {
        return await writeFile(path, newData, sha, `Update ${path.split('/').pop()}`)
      } catch (error) {
        if (!isShaConflict(error) || attempt === 3) throw error
      }
    }
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