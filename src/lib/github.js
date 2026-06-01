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
    { headers: { Authorization: `token ${token()}` } }
  )
  if (res.status === 404) {
    // File doesn't exist yet - return empty default and null SHA (new file)
    const empty = path.includes('meal_plan') ? {} : []
    return { data: empty, sha: null }
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

export async function fetchMealPlan() {
  const res = await fetch(`${import.meta.env.BASE_URL}meal_plan.json?t=${Date.now()}`)
  if (!res.ok) return {}
  return res.json()
}

// --- Authenticated API access (for planner and recipe form writes) ---

export const getRecipes = () => readFile('public/recipes.json')
export const getMealPlan = () => readFile('public/meal_plan.json')

export const saveRecipes = (data, sha) =>
  writeFile('public/recipes.json', data, sha, 'Update recipes')
export const saveMealPlan = (data, sha) =>
  writeFile('public/meal_plan.json', data, sha, 'Update meal plan')

// --- Auth validation ---

export async function validateToken(pat) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}`,
    { headers: { Authorization: `token ${pat}` } }
  )
  return res.ok
}