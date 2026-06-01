# COOKBOOK APP — AGENT BUILD SPEC

## HOW TO USE THIS SPEC

Read this entire file before writing any code. Then execute the steps in order:
1. Run the shell commands in SETUP
2. Create every file listed under FILES, with exactly the content shown
3. Commit and push to trigger the deploy pipeline

Do not skip files. Do not summarise or partially implement components.
All placeholder values are marked with `__DOUBLE_UNDERSCORES__` and listed in PLACEHOLDERS.

---

## PLACEHOLDERS — REPLACE BEFORE WRITING ANY FILE

| Placeholder | Description | Example |
|---|---|---|
| `__GITHUB_USERNAME__` | GitHub account username | `tomschmidt` |
| `__REPO_NAME__` | Exact repository name | `cookbook` |

The repo name also determines the GitHub Pages URL: `https://__GITHUB_USERNAME__.github.io/__REPO_NAME__/`
If the repo is named `__GITHUB_USERNAME__.github.io`, use `/` as the Vite base instead of `/__REPO_NAME__/`.

These placeholders are:
__GITHUB_USERNAME__ = tlkaufmann
__REPO_NAME__ = cookbook

---

## WHAT REQUIRES HUMAN ACTION (do not automate)

The following must be done manually by the user before or after the agent runs:

1. **Create the GitHub repo** — public, named `__REPO_NAME__`
2. **Enable GitHub Pages** — repo Settings → Pages → Source: GitHub Actions
3. **Generate a PAT** — GitHub Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
   - Scope: only the `__REPO_NAME__` repo
   - Permission: Contents → Read and Write
   - Save the token — it will be entered in the app UI once per device
4. **Push the repo** — `git init`, `git remote add origin`, `git push`

---

## PROJECT OVERVIEW

A personal cookbook web app. Single user. No server. Data stored as two JSON files in the repo. Reads are plain static fetches. Writes go through the GitHub Contents API using a Personal Access Token stored in localStorage.

**Features:**
- Recipe list with full-text search and multi-tag filtering
- Recipe detail view with live servings scaler
- Add and edit recipes through a form UI (auth-gated)
- Weekly meal planner: assign recipes to day/slot combinations
- Shopping list generated from the current week's plan, with ingredient aggregation

**Stack:** React 18 + Vite 5 + Tailwind CSS 3 + React Router 6 (hash mode)
**Hosting:** GitHub Pages via GitHub Actions
**Data:** `public/recipes.json` and `public/meal_plan.json`
**Auth:** GitHub PAT entered once per device, stored in localStorage

---

## COMPLETE FILE TREE

```
__REPO_NAME__/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── public/
│   ├── recipes.json
│   └── meal_plan.json
├── src/
│   ├── lib/
│   │   └── github.js
│   ├── components/
│   │   ├── AuthGate.jsx
│   │   ├── Nav.jsx
│   │   └── TagPill.jsx
│   ├── pages/
│   │   ├── RecipeList.jsx
│   │   ├── RecipeDetail.jsx
│   │   ├── RecipeForm.jsx
│   │   ├── Planner.jsx
│   │   └── ShoppingList.jsx
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

---

## SETUP COMMANDS

Run these in order from the project root directory.

```bash
npm create vite@latest __REPO_NAME__ -- --template react
cd __REPO_NAME__
npm install
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
npm install react-router-dom
```

Then create the directory structure:

```bash
mkdir -p .github/workflows src/lib src/components src/pages
```

---

## FILES

Create every file below with exactly the content shown.

---

### `package.json`

Replace the generated one entirely:

```json
{
  "name": "__REPO_NAME__",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.11",
    "vite": "^5.4.2"
  }
}
```

---

### `vite.config.js`

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/__REPO_NAME__/',
})
```

---

### `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

---

### `postcss.config.js`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cookbook</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

---

### `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

### `public/recipes.json`

```json
[]
```

---

### `public/meal_plan.json`

```json
{}
```

---

### `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

### `src/lib/github.js`

This is the entire data layer. All reads and writes go through here.
`import.meta.env.BASE_URL` resolves to `/__REPO_NAME__/` in production and `/` in dev — no hardcoding needed for static fetches.

```js
const OWNER  = '__GITHUB_USERNAME__'
const REPO   = '__REPO_NAME__'
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
    // File doesn't exist yet — return empty default and null SHA (new file)
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
  if (sha) body.sha = sha  // omit SHA when creating a new file
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

export const getRecipes  = () => readFile('public/recipes.json')
export const getMealPlan = () => readFile('public/meal_plan.json')

export const saveRecipes  = (data, sha) =>
  writeFile('public/recipes.json',   data, sha, 'Update recipes')
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
```

---

### `src/components/AuthGate.jsx`

Wraps any route that requires write access. Validates the PAT against GitHub and stores it in localStorage.

```jsx
import { useState } from 'react'
import { validateToken } from '../lib/github'

export default function AuthGate({ children }) {
  const stored = localStorage.getItem('gh_pat')
  const [pat, setPat]           = useState(stored || '')
  const [unlocked, setUnlocked] = useState(!!stored)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleUnlock() {
    setLoading(true)
    setError('')
    const valid = await validateToken(pat)
    setLoading(false)
    if (valid) {
      localStorage.setItem('gh_pat', pat)
      setUnlocked(true)
    } else {
      setError('Token rejected — check it has Contents write access to this repo.')
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
        className="border border-gray-300 rounded px-3 py-2 w-80 font-mono text-sm
                   focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      <button
        onClick={handleUnlock}
        disabled={loading || !pat}
        className="bg-gray-900 text-white px-6 py-2 rounded text-sm font-medium
                   hover:bg-gray-700 disabled:opacity-40 transition-colors"
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
```

---

### `src/components/Nav.jsx`

Sticky top nav. Links to all main sections. Highlights the active route.

```jsx
import { Link, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/',         label: 'Recipes'  },
  { to: '/planner',  label: 'Planner'  },
  { to: '/shopping', label: 'Shopping' },
]

export default function Nav() {
  const { pathname } = useLocation()

  return (
    <nav className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="font-semibold text-gray-900 text-lg tracking-tight">
          🍳 Cookbook
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === l.to
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/add"
            className="ml-2 px-3 py-1.5 bg-gray-900 text-white rounded text-sm
                       font-medium hover:bg-gray-700 transition-colors"
          >
            + Add
          </Link>
        </div>
      </div>
    </nav>
  )
}
```

---

### `src/components/TagPill.jsx`

Reusable tag component with three modes:
- `onClick` only → clickable filter toggle (active/inactive style)
- `onRemove` only → chip with × button (used in form)
- Neither → static display pill

```jsx
export default function TagPill({ tag, active, onClick, onRemove }) {
  if (onRemove) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100
                       text-gray-700 rounded text-xs">
        {tag}
        <button
          type="button"
          onClick={() => onRemove(tag)}
          className="hover:text-red-500 transition-colors leading-none"
        >
          ×
        </button>
      </span>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(tag)}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          active
            ? 'bg-gray-900 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        {tag}
      </button>
    )
  }

  return (
    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
      {tag}
    </span>
  )
}
```

---

### `src/App.jsx`

HashRouter is required for GitHub Pages — hash-based URLs (`/#/recipe/123`) work without server-side routing.
Planner is auth-gated because it writes to the repo. Shopping list is public read-only.

```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import Nav          from './components/Nav'
import AuthGate     from './components/AuthGate'
import RecipeList   from './pages/RecipeList'
import RecipeDetail from './pages/RecipeDetail'
import RecipeForm   from './pages/RecipeForm'
import Planner      from './pages/Planner'
import ShoppingList from './pages/ShoppingList'

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/"           element={<RecipeList />}   />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/shopping"   element={<ShoppingList />} />
          <Route path="/planner"    element={<AuthGate><Planner /></AuthGate>}    />
          <Route path="/add"        element={<AuthGate><RecipeForm /></AuthGate>} />
          <Route path="/edit/:id"   element={<AuthGate><RecipeForm /></AuthGate>} />
        </Routes>
      </main>
    </HashRouter>
  )
}
```

---

### `src/main.jsx`

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

---

### `src/pages/RecipeList.jsx`

Public page. Reads from the static JSON file (no auth). Filters are computed client-side.
Multi-tag filter is AND-logic: recipe must have ALL selected tags.
Search checks title, description, and ingredient names.

```jsx
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { fetchRecipes } from '../lib/github'
import TagPill from '../components/TagPill'

export default function RecipeList() {
  const [recipes, setRecipes]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [activeTags, setActiveTags] = useState(new Set())

  useEffect(() => {
    fetchRecipes().then(data => {
      setRecipes(data)
      setLoading(false)
    })
  }, [])

  const allTags = useMemo(() => {
    const tags = new Set()
    recipes.forEach(r => r.tags?.forEach(t => tags.add(t)))
    return [...tags].sort()
  }, [recipes])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return recipes.filter(r => {
      const matchesSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.ingredients?.some(i => i.name.toLowerCase().includes(q))
      const matchesTags = [...activeTags].every(t => r.tags?.includes(t))
      return matchesSearch && matchesTags
    })
  }, [recipes, search, activeTags])

  function toggleTag(tag) {
    setActiveTags(prev => {
      const next = new Set(prev)
      next.has(tag) ? next.delete(tag) : next.add(tag)
      return next
    })
  }

  if (loading) {
    return <p className="text-gray-400 text-sm mt-12 text-center">Loading recipes…</p>
  }

  return (
    <div className="space-y-6">
      <input
        type="search"
        placeholder="Search recipes or ingredients…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm
                   focus:outline-none focus:ring-2 focus:ring-gray-300"
      />

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {allTags.map(tag => (
            <TagPill
              key={tag}
              tag={tag}
              active={activeTags.has(tag)}
              onClick={toggleTag}
            />
          ))}
          {activeTags.size > 0 && (
            <button
              onClick={() => setActiveTags(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 ml-1 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm">
            {recipes.length === 0 ? 'No recipes yet. Add your first one!' : 'No recipes match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(recipe => (
            <Link
              key={recipe.id}
              to={`/recipe/${recipe.id}`}
              className="block border border-gray-200 rounded-lg p-4
                         hover:border-gray-400 transition-colors"
            >
              <h2 className="font-semibold text-gray-900 mb-1">{recipe.title}</h2>
              {recipe.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                  {recipe.description}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {recipe.tags?.slice(0, 3).map(tag => (
                    <TagPill key={tag} tag={tag} />
                  ))}
                  {(recipe.tags?.length || 0) > 3 && (
                    <span className="text-xs text-gray-400">+{recipe.tags.length - 3}</span>
                  )}
                </div>
                {((recipe.prep_min || 0) + (recipe.cook_min || 0)) > 0 && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {(recipe.prep_min || 0) + (recipe.cook_min || 0)} min
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### `src/pages/RecipeDetail.jsx`

Public page. Servings scaler multiplies all ingredient amounts by `currentServings / baseServings`.
Edit button links to the auth-gated form.

```jsx
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchRecipes } from '../lib/github'
import TagPill from '../components/TagPill'

function formatAmount(amount, scale) {
  const scaled = amount * scale
  const rounded = parseFloat(scaled.toFixed(2))
  // Drop unnecessary decimal zeros: 2.00 → 2, 0.50 → 0.5
  return rounded
}

export default function RecipeDetail() {
  const { id } = useParams()
  const [recipe, setRecipe]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [servings, setServings] = useState(null)

  useEffect(() => {
    fetchRecipes().then(data => {
      const found = data.find(r => r.id === id) || null
      setRecipe(found)
      setServings(found?.servings ?? 1)
      setLoading(false)
    })
  }, [id])

  if (loading) return <p className="text-gray-400 text-sm mt-12 text-center">Loading…</p>
  if (!recipe)  return <p className="text-gray-500 text-sm mt-12 text-center">Recipe not found.</p>

  const scale = servings / recipe.servings

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{recipe.title}</h1>
          <Link
            to={`/edit/${recipe.id}`}
            className="shrink-0 text-sm text-gray-400 hover:text-gray-700
                       border border-gray-200 rounded px-3 py-1 transition-colors"
          >
            Edit
          </Link>
        </div>

        {recipe.description && (
          <p className="text-gray-600">{recipe.description}</p>
        )}

        {recipe.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.tags.map(tag => <TagPill key={tag} tag={tag} />)}
          </div>
        )}

        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          {recipe.prep_min > 0 && <span>Prep: <strong>{recipe.prep_min} min</strong></span>}
          {recipe.cook_min > 0 && <span>Cook: <strong>{recipe.cook_min} min</strong></span>}
          {recipe.source    && <span>Source: <strong>{recipe.source}</strong></span>}
        </div>

        {/* Servings scaler */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-sm font-medium text-gray-700">Servings</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServings(s => Math.max(1, s - 1))}
              className="w-7 h-7 rounded border border-gray-300 text-gray-600
                         hover:bg-gray-50 flex items-center justify-center text-base leading-none"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold text-gray-900 tabular-nums">
              {servings}
            </span>
            <button
              onClick={() => setServings(s => s + 1)}
              className="w-7 h-7 rounded border border-gray-300 text-gray-600
                         hover:bg-gray-50 flex items-center justify-center text-base leading-none"
            >
              +
            </button>
          </div>
          {scale !== 1 && (
            <button
              onClick={() => setServings(recipe.servings)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Ingredients & Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide">
            Ingredients
          </h2>
          <ul className="space-y-2">
            {recipe.ingredients?.map((ing, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="font-medium text-gray-900 shrink-0 tabular-nums">
                  {formatAmount(ing.amount, scale)}
                  {ing.unit ? ` ${ing.unit}` : ''}
                </span>
                <span>{ing.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide">
            Steps
          </h2>
          <ol className="space-y-4">
            {recipe.steps?.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700">
                <span className="shrink-0 w-5 h-5 rounded-full bg-gray-900 text-white
                                 flex items-center justify-center text-xs font-medium mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
```

---

### `src/pages/RecipeForm.jsx`

Auth-gated. Used for both add and edit — detected by presence of `:id` param.
On save: reads current `recipes.json` from GitHub API (to get SHA), patches/appends, writes back.
Redirect: after add → new recipe detail; after edit → same recipe detail.

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchRecipes, getRecipes, saveRecipes } from '../lib/github'
import TagPill from '../components/TagPill'

const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', '']

function blankIngredient() { return { amount: '', unit: 'g', name: '' } }
function blankRecipe() {
  return {
    title: '', description: '', servings: 2,
    prep_min: 0, cook_min: 0, tags: [],
    ingredients: [blankIngredient()],
    steps: [''], source: '',
  }
}

export default function RecipeForm() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const isEditing   = !!id

  const [form, setForm]       = useState(blankRecipe())
  const [tagInput, setTagInput] = useState('')
  const [allTags, setAllTags]   = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(isEditing)

  useEffect(() => {
    fetchRecipes().then(data => {
      const tags = new Set()
      data.forEach(r => r.tags?.forEach(t => tags.add(t)))
      setAllTags([...tags].sort())
      if (isEditing) {
        const recipe = data.find(r => r.id === id)
        if (recipe) setForm(recipe)
      }
      setLoading(false)
    })
  }, [id, isEditing])

  function field(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Ingredient helpers
  function setIng(i, key, value) {
    setForm(prev => {
      const ingredients = [...prev.ingredients]
      ingredients[i] = { ...ingredients[i], [key]: value }
      return { ...prev, ingredients }
    })
  }
  function addIng()     { setForm(prev => ({ ...prev, ingredients: [...prev.ingredients, blankIngredient()] })) }
  function removeIng(i) { setForm(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, idx) => idx !== i) })) }

  // Step helpers
  function setStep(i, value) {
    setForm(prev => { const steps = [...prev.steps]; steps[i] = value; return { ...prev, steps } })
  }
  function addStep()     { setForm(prev => ({ ...prev, steps: [...prev.steps, ''] })) }
  function removeStep(i) { setForm(prev => ({ ...prev, steps: prev.steps.filter((_, idx) => idx !== i) })) }
  function moveStep(i, dir) {
    setForm(prev => {
      const steps = [...prev.steps]
      const j = i + dir
      if (j < 0 || j >= steps.length) return prev
      ;[steps[i], steps[j]] = [steps[j], steps[i]]
      return { ...prev, steps }
    })
  }

  // Tag helpers
  function addTag(raw) {
    const t = raw.trim().toLowerCase().replace(/,/g, '')
    if (t && !form.tags.includes(t)) setForm(prev => ({ ...prev, tags: [...prev.tags, t] }))
    setTagInput('')
  }
  function removeTag(tag) { setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) })) }

  const tagSuggestions = tagInput
    ? allTags.filter(t => t.includes(tagInput.toLowerCase()) && !form.tags.includes(t)).slice(0, 6)
    : []

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError('')
    try {
      const { data: recipes, sha } = await getRecipes()
      let updated
      let targetId = id

      if (isEditing) {
        updated = recipes.map(r => r.id === id ? { ...form, id } : r)
      } else {
        targetId = Date.now().toString()
        updated = [...recipes, { ...form, id: targetId, created_at: new Date().toISOString() }]
      }

      await saveRecipes(updated, sha)
      navigate(`/recipe/${targetId}`, { replace: true })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (loading) return <p className="text-gray-400 text-sm mt-12 text-center">Loading…</p>

  const inputCls = 'w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'

  return (
    <div className="space-y-8 pb-16">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gray-900 text-white px-4 py-2 rounded text-sm font-medium
                     hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Recipe'}
        </button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Basic fields */}
      <section className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input value={form.title} onChange={e => field('title', e.target.value)}
            className={inputCls} placeholder="Recipe name" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={e => field('description', e.target.value)}
            rows={2} className={inputCls} placeholder="Short description" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Servings', key: 'servings', min: 1 },
            { label: 'Prep (min)', key: 'prep_min', min: 0 },
            { label: 'Cook (min)', key: 'cook_min', min: 0 },
          ].map(({ label, key, min }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input type="number" min={min} value={form[key]}
                onChange={e => field(key, parseInt(e.target.value) || 0)}
                className={inputCls} />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <input value={form.source} onChange={e => field('source', e.target.value)}
            className={inputCls} placeholder="Book, website, person…" />
        </div>
      </section>

      {/* Tags */}
      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map(tag => <TagPill key={tag} tag={tag} onRemove={removeTag} />)}
        </div>
        <div className="relative">
          <input
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
            className={inputCls}
            placeholder="Add tag — press Enter or comma to confirm"
          />
          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-b shadow-sm">
              {tagSuggestions.map(t => (
                <button key={t} type="button" onClick={() => addTag(t)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ingredients */}
      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients</label>
        <div className="space-y-2">
          {form.ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input type="number" min="0" step="any" value={ing.amount}
                onChange={e => setIng(i, 'amount', e.target.value)}
                placeholder="Qty"
                className="w-20 border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              <select value={ing.unit} onChange={e => setIng(i, 'unit', e.target.value)}
                className="border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                {UNITS.map(u => <option key={u} value={u}>{u || '—'}</option>)}
              </select>
              <input value={ing.name} onChange={e => setIng(i, 'name', e.target.value)}
                placeholder="Ingredient"
                className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              <button type="button" onClick={() => removeIng(i)}
                className="text-gray-300 hover:text-red-400 text-xl leading-none transition-colors">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addIng}
          className="mt-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          + Add ingredient
        </button>
      </section>

      {/* Steps */}
      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">Steps</label>
        <div className="space-y-2">
          {form.steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500
                               flex items-center justify-center text-xs font-medium mt-2.5">
                {i + 1}
              </span>
              <textarea value={step} onChange={e => setStep(i, e.target.value)}
                rows={2} placeholder={`Step ${i + 1}`}
                className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
              <div className="flex flex-col gap-0.5 mt-2">
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs transition-colors">▲</button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1}
                  className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs transition-colors">▼</button>
              </div>
              <button type="button" onClick={() => removeStep(i)}
                className="text-gray-300 hover:text-red-400 text-xl leading-none transition-colors mt-2">×</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addStep}
          className="mt-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          + Add step
        </button>
      </section>

      {/* Bottom save */}
      <button onClick={handleSave} disabled={saving}
        className="w-full bg-gray-900 text-white py-3 rounded font-medium
                   hover:bg-gray-700 disabled:opacity-40 transition-colors">
        {saving ? 'Saving…' : 'Save Recipe'}
      </button>
    </div>
  )
}
```

---

### `src/pages/Planner.jsx`

Auth-gated. Displays a 7-day week grid (Mon–Sun) with four meal slots per day.
Recipes are assigned via a modal picker with a servings control.
Plan is saved explicitly (one button) to avoid hammering the GitHub API.
SHA is updated from the API response after each save so subsequent saves work correctly.

```jsx
import { useState, useEffect } from 'react'
import { fetchRecipes, getMealPlan, saveMealPlan } from '../lib/github'

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']

function getMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function toDateStr(date) { return date.toISOString().split('T')[0] }
function fmtDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Planner() {
  const [weekStart, setWeekStart]   = useState(() => getMonday(new Date()))
  const [recipes, setRecipes]       = useState([])
  const [plan, setPlan]             = useState({})
  const [sha, setSha]               = useState(null)
  const [dirty, setDirty]           = useState(false)
  const [saving, setSaving]         = useState(false)
  // Picker
  const [pickerTarget, setPickerTarget]   = useState(null) // { date, slot }
  const [pickerSearch, setPickerSearch]   = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [pickerServings, setPickerServings] = useState(2)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))

  useEffect(() => {
    fetchRecipes().then(setRecipes)
    getMealPlan().then(({ data, sha }) => { setPlan(data); setSha(sha) })
  }, [])

  function getEntries(date, slot) {
    return (plan[toDateStr(date)] || []).filter(e => e.slot === slot)
  }

  function removeEntry(date, slot, recipeId) {
    const ds = toDateStr(date)
    setPlan(prev => ({
      ...prev,
      [ds]: (prev[ds] || []).filter(e => !(e.slot === slot && e.recipe_id === recipeId))
    }))
    setDirty(true)
  }

  function openPicker(date, slot) {
    setPickerTarget({ date, slot })
    setPickerSearch('')
    setSelectedRecipe(null)
    setPickerServings(2)
  }

  function confirmAdd() {
    if (!pickerTarget || !selectedRecipe) return
    const ds = toDateStr(pickerTarget.date)
    setPlan(prev => ({
      ...prev,
      [ds]: [...(prev[ds] || []), {
        slot: pickerTarget.slot,
        recipe_id: selectedRecipe.id,
        servings: pickerServings,
      }]
    }))
    setDirty(true)
    setPickerTarget(null)
    setSelectedRecipe(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const result = await saveMealPlan(plan, sha)
      setSha(result.content.sha) // update SHA from response for future saves
      setDirty(false)
    } catch (e) {
      alert('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  const pickerFiltered = pickerSearch
    ? recipes.filter(r => r.title.toLowerCase().includes(pickerSearch.toLowerCase()))
    : recipes

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart(d => addDays(d, -7))}
          className="text-gray-500 hover:text-gray-900 text-sm px-2 transition-colors">
          ← Prev
        </button>
        <span className="text-sm font-medium text-gray-700">
          {fmtDate(weekStart)} – {fmtDate(addDays(weekStart, 6))}
        </span>
        <button onClick={() => setWeekStart(d => addDays(d, 7))}
          className="text-gray-500 hover:text-gray-900 text-sm px-2 transition-colors">
          Next →
        </button>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="bg-gray-900 text-white px-4 py-1.5 rounded text-sm
                       hover:bg-gray-700 disabled:opacity-40 transition-colors">
            {saving ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      )}

      {/* Calendar grid */}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-7 gap-2 min-w-[700px]">
          {weekDates.map(date => (
            <div key={toDateStr(date)} className="space-y-1.5">
              <div className="text-xs font-medium text-gray-500 text-center pb-1 border-b border-gray-100">
                {fmtDate(date)}
              </div>
              {SLOTS.map(slot => (
                <div key={slot} className="border border-gray-100 rounded p-1.5 min-h-[70px]
                                           space-y-1 bg-gray-50/40">
                  <div className="text-xs text-gray-400 capitalize font-medium">{slot}</div>
                  {getEntries(date, slot).map(entry => {
                    const r = recipeMap[entry.recipe_id]
                    return r ? (
                      <div key={entry.recipe_id + slot}
                        className="text-xs bg-white border border-gray-200 rounded px-1.5 py-1
                                   flex items-start justify-between gap-1">
                        <span className="truncate leading-tight">{r.title}</span>
                        <button onClick={() => removeEntry(date, slot, entry.recipe_id)}
                          className="text-gray-300 hover:text-red-400 shrink-0 text-base leading-none transition-colors">
                          ×
                        </button>
                      </div>
                    ) : null
                  })}
                  <button onClick={() => openPicker(date, slot)}
                    className="text-xs text-gray-300 hover:text-gray-600 transition-colors">
                    + add
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Recipe picker modal */}
      {pickerTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3 shadow-2xl">
            <h3 className="font-semibold text-gray-900 capitalize">
              {pickerTarget.slot} — {fmtDate(pickerTarget.date)}
            </h3>
            <input autoFocus value={pickerSearch}
              onChange={e => { setPickerSearch(e.target.value); setSelectedRecipe(null) }}
              placeholder="Search recipes…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-300" />
            <div className="max-h-48 overflow-y-auto rounded border border-gray-100 divide-y divide-gray-50">
              {pickerFiltered.length === 0
                ? <p className="px-3 py-3 text-sm text-gray-400">No recipes found</p>
                : pickerFiltered.map(r => (
                    <button key={r.id} onClick={() => { setSelectedRecipe(r); setPickerServings(r.servings) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedRecipe?.id === r.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-700'
                      }`}>
                      {r.title}
                    </button>
                  ))
              }
            </div>
            {selectedRecipe && (
              <div className="flex items-center gap-3 pt-1">
                <label className="text-sm text-gray-600">Servings:</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPickerServings(s => Math.max(1, s - 1))}
                    className="w-6 h-6 rounded border border-gray-200 text-sm flex items-center justify-center hover:bg-gray-50">−</button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{pickerServings}</span>
                  <button onClick={() => setPickerServings(s => s + 1)}
                    className="w-6 h-6 rounded border border-gray-200 text-sm flex items-center justify-center hover:bg-gray-50">+</button>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={confirmAdd} disabled={!selectedRecipe}
                className="flex-1 bg-gray-900 text-white py-2 rounded text-sm font-medium
                           hover:bg-gray-700 disabled:opacity-40 transition-colors">
                Add to plan
              </button>
              <button onClick={() => { setPickerTarget(null); setSelectedRecipe(null) }}
                className="px-4 border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

### `src/pages/ShoppingList.jsx`

Public page. Aggregates ingredients from the current week's meal plan.
Unit conflicts (same ingredient with different units across recipes) are flagged rather than silently merged.
Checkboxes are local state only — no persistence needed.

```jsx
import { useState, useEffect, useMemo } from 'react'
import { fetchRecipes, fetchMealPlan } from '../lib/github'

function getMonday(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function toDateStr(date) { return date.toISOString().split('T')[0] }

function buildList(plan, recipes, dateRange) {
  const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))
  const totals = {}

  for (const ds of dateRange) {
    for (const { recipe_id, servings } of (plan[ds] || [])) {
      const recipe = recipeMap[recipe_id]
      if (!recipe) continue
      const scale = servings / recipe.servings

      for (const ing of (recipe.ingredients || [])) {
        const key = ing.name.toLowerCase()
        if (!totals[key]) {
          totals[key] = { name: ing.name, unit: ing.unit, amount: 0, conflict: false }
        }
        if (totals[key].unit !== ing.unit && !totals[key].conflict) {
          totals[key].conflict = true
          totals[key].conflictNote = `${parseFloat(totals[key].amount.toFixed(2))}${totals[key].unit || ''} + ${parseFloat((ing.amount * scale).toFixed(2))}${ing.unit || ''}`
        } else if (!totals[key].conflict) {
          totals[key].amount += ing.amount * scale
        }
      }
    }
  }

  return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name))
}

export default function ShoppingList() {
  const [recipes, setRecipes] = useState([])
  const [plan, setPlan]       = useState({})
  const [loading, setLoading] = useState(true)
  const [checked, setChecked] = useState(new Set())

  const weekStart = useMemo(() => getMonday(new Date()), [])
  const dateRange = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toDateStr(addDays(weekStart, i))),
    [weekStart]
  )

  useEffect(() => {
    Promise.all([fetchRecipes(), fetchMealPlan()]).then(([r, p]) => {
      setRecipes(r); setPlan(p); setLoading(false)
    })
  }, [])

  const items = useMemo(() => buildList(plan, recipes, dateRange), [plan, recipes, dateRange])

  function toggle(name) {
    setChecked(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  }

  function copyList() {
    const text = items
      .filter(i => !checked.has(i.name))
      .map(i => i.conflict
        ? `⚠ ${i.name} — ${i.conflictNote} (check units)`
        : `${parseFloat(i.amount.toFixed(2))}${i.unit ? ' ' + i.unit : ''} ${i.name}`)
      .join('\n')
    navigator.clipboard.writeText(text)
  }

  if (loading) return <p className="text-gray-400 text-sm mt-12 text-center">Loading…</p>

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-2">
        <p className="text-gray-400 text-sm">No meals planned for this week.</p>
        <p className="text-xs text-gray-300">Add recipes in the Planner to generate a shopping list.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">This week's shopping</h1>
        <div className="flex items-center gap-3">
          {checked.size > 0 && (
            <button onClick={() => setChecked(new Set())}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Clear checks
            </button>
          )}
          <button onClick={copyList}
            className="text-xs border border-gray-200 rounded px-3 py-1.5 text-gray-600
                       hover:bg-gray-50 transition-colors">
            Copy list
          </button>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {items.map(item => (
          <li key={item.name}
            className={`flex items-start gap-3 py-3 transition-opacity ${checked.has(item.name) ? 'opacity-35' : ''}`}>
            <input type="checkbox" checked={checked.has(item.name)} onChange={() => toggle(item.name)}
              className="mt-0.5 accent-gray-900 cursor-pointer" />
            {item.conflict ? (
              <p className="text-sm text-orange-500">
                ⚠ <span className="font-medium">{item.name}</span> — {item.conflictNote} (mixed units, check manually)
              </p>
            ) : (
              <p className={`text-sm text-gray-800 ${checked.has(item.name) ? 'line-through' : ''}`}>
                <span className="font-medium tabular-nums">
                  {parseFloat(item.amount.toFixed(2))}{item.unit ? ` ${item.unit}` : ''}
                </span>{' '}
                {item.name}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

---

## DATA SCHEMAS (reference)

### Recipe object
```json
{
  "id": "1748600000000",
  "title": "Pasta Aglio e Olio",
  "description": "Simple Italian classic with garlic and olive oil.",
  "servings": 2,
  "prep_min": 10,
  "cook_min": 20,
  "tags": ["italian", "dinner", "vegan", "quick"],
  "ingredients": [
    { "amount": 200, "unit": "g",   "name": "spaghetti"    },
    { "amount": 4,   "unit": "",    "name": "garlic cloves" },
    { "amount": 60,  "unit": "ml",  "name": "olive oil"    },
    { "amount": 0.5, "unit": "tsp", "name": "chilli flakes" }
  ],
  "steps": [
    "Boil pasta in well-salted water until al dente.",
    "Slice garlic thinly and fry in olive oil over medium heat until golden.",
    "Toss drained pasta with the garlic oil and a splash of pasta water.",
    "Serve with chilli flakes."
  ],
  "source": "Nonna",
  "created_at": "2026-05-30T10:00:00Z"
}
```

### Meal plan object
```json
{
  "2026-05-30": [
    { "slot": "breakfast", "recipe_id": "1748600000000", "servings": 1 },
    { "slot": "dinner",    "recipe_id": "1748600000001", "servings": 2 }
  ]
}
```

Valid slots: `breakfast`, `lunch`, `dinner`, `snack`.
Multiple entries per slot per day are allowed.

---

## VERIFICATION CHECKLIST

After creating all files, run:

```bash
npm run dev
```

Verify in the browser:
- [ ] Recipe list loads (empty state shown correctly)
- [ ] `/add` route shows the PAT entry screen
- [ ] Entering a valid PAT unlocks the form
- [ ] Submitting the form creates a commit in the repo and redirects to the recipe detail
- [ ] The recipe detail shows with working servings scaler
- [ ] The meal planner shows the week grid
- [ ] Adding a recipe to a slot and saving creates a commit
- [ ] The shopping list shows aggregated ingredients from the planned meals

Then commit and push to trigger the GitHub Actions deploy:

```bash
git add .
git commit -m "Initial cookbook app"
git push origin main
```

Wait ~60 seconds and verify the live site at `https://__GITHUB_USERNAME__.github.io/__REPO_NAME__/`.

