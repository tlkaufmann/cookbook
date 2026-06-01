import { useEffect, useMemo, useState } from 'react'
import TagPill from '../components/TagPill'
import { getRecipes, updateRecipes } from '../lib/github'
import { normalizeTag } from '../lib/planner'

function sortTags(tags) {
  return [...new Set(tags)].sort((left, right) => left.localeCompare(right))
}

export default function TagManager() {
  const [recipes, setRecipes] = useState([])
  const [draftRecipes, setDraftRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [bulkRemoveTag, setBulkRemoveTag] = useState('')
  const [rowTagInputs, setRowTagInputs] = useState({})
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const { data } = await getRecipes()
        if (!alive) return
        setRecipes(data)
        setDraftRecipes(data)
      } catch (loadError) {
        if (!alive) return
        setError(loadError.message)
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return draftRecipes

    return draftRecipes.filter(recipe => {
      return recipe.title.toLowerCase().includes(query) || recipe.tags?.some(tag => tag.includes(query))
    })
  }, [draftRecipes, search])

  const allTags = useMemo(() => {
    const counts = new Map()
    for (const recipe of draftRecipes) {
      for (const tag of recipe.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1)
      }
    }

    return [...counts.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([tag, count]) => ({ tag, count }))
  }, [draftRecipes])

  const hasChanges = useMemo(() => {
    return JSON.stringify(recipes) !== JSON.stringify(draftRecipes)
  }, [draftRecipes, recipes])

  function updateRecipeTags(recipeId, updater) {
    setDraftRecipes(prev => prev.map(recipe => {
      if (recipe.id !== recipeId) return recipe
      return {
        ...recipe,
        tags: sortTags(updater(recipe.tags || [])),
      }
    }))
  }

  function addTagToRecipe(recipeId, rawTag) {
    const nextTag = normalizeTag(rawTag)
    if (!nextTag) return

    updateRecipeTags(recipeId, tags => (tags.includes(nextTag) ? tags : [...tags, nextTag]))
    setRowTagInputs(prev => ({ ...prev, [recipeId]: '' }))
    setNotice('')
  }

  function removeTagFromRecipe(recipeId, tagToRemove) {
    updateRecipeTags(recipeId, tags => tags.filter(tag => tag !== tagToRemove))
    setNotice('')
  }

  function toggleSelected(recipeId) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(recipeId)) next.delete(recipeId)
      else next.add(recipeId)
      return next
    })
  }

  function selectFiltered() {
    setSelectedIds(new Set(filteredRecipes.map(recipe => recipe.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function applyTagToSelected() {
    const nextTag = normalizeTag(bulkTagInput)
    if (!nextTag || selectedIds.size === 0) return

    setDraftRecipes(prev => prev.map(recipe => {
      if (!selectedIds.has(recipe.id)) return recipe
      const tags = recipe.tags || []
      return {
        ...recipe,
        tags: tags.includes(nextTag) ? tags : sortTags([...tags, nextTag]),
      }
    }))
    setBulkTagInput('')
    setNotice('')
  }

  function removeTagFromSelected() {
    if (!bulkRemoveTag || selectedIds.size === 0) return

    setDraftRecipes(prev => prev.map(recipe => {
      if (!selectedIds.has(recipe.id)) return recipe
      return {
        ...recipe,
        tags: (recipe.tags || []).filter(tag => tag !== bulkRemoveTag),
      }
    }))
    setNotice('')
  }

  function removeTagEverywhere(tagToRemove) {
    const confirmed = window.confirm(`Remove "${tagToRemove}" from every recipe?`)
    if (!confirmed) return

    setDraftRecipes(prev => prev.map(recipe => ({
      ...recipe,
      tags: (recipe.tags || []).filter(tag => tag !== tagToRemove),
    })))
    setNotice('')
  }

  async function handleSave() {
    setSaving(true)
    setError('')

    try {
      const draftById = Object.fromEntries(draftRecipes.map(recipe => [recipe.id, recipe]))
      await updateRecipes(currentRecipes => currentRecipes.map(recipe => {
        const draft = draftById[recipe.id]
        return draft ? { ...recipe, tags: draft.tags || [] } : recipe
      }))
      setRecipes(draftRecipes)
      setNotice('Tag changes saved. The site will reflect them after the next deploy finishes.')
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-gray-400 text-sm mt-12 text-center">Loading tags…</p>
  }

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tag editor</h1>
          <p className="text-sm text-gray-500 mt-1">
            Remove noisy tags globally or apply a tag across a batch of recipes before saving once.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="bg-[#143109] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-colors"
        >
          {saving ? 'Saving…' : 'Save tag changes'}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">{notice}</p>}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-[#143109]/10 bg-white/80 p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Filter recipes</label>
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search title or tag…"
            className="w-full border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
          />
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            <span>{filteredRecipes.length} visible</span>
            <span>{selectedIds.size} selected</span>
            <button onClick={selectFiltered} className="text-[#143109] hover:opacity-80 transition-colors">Select visible</button>
            <button onClick={clearSelection} className="text-[#143109] hover:opacity-80 transition-colors">Clear selection</button>
          </div>
        </div>

        <div className="rounded-xl border border-[#143109]/10 bg-white/80 p-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">Bulk tag actions</label>
          <div className="flex gap-2">
            <input
              value={bulkTagInput}
              onChange={event => setBulkTagInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyTagToSelected()
                }
              }}
              placeholder="Add tag to selected recipes"
              className="flex-1 border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
            />
            <button
              onClick={applyTagToSelected}
              disabled={!bulkTagInput || selectedIds.size === 0}
              className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 disabled:opacity-40 transition-colors"
            >
              Apply
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={bulkRemoveTag}
              onChange={event => setBulkRemoveTag(event.target.value)}
              className="flex-1 border border-[#143109]/20 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
            >
              <option value="">Remove tag from selected recipes</option>
              {allTags.map(({ tag }) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <button
              onClick={removeTagFromSelected}
              disabled={!bulkRemoveTag || selectedIds.size === 0}
              className="border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#143109]/10 bg-white/80 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">Global tags</h2>
          <span className="text-xs text-gray-400">Remove from all recipes in one click</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {allTags.length === 0 && <span className="text-sm text-gray-400">No tags yet.</span>}
          {allTags.map(({ tag, count }) => (
            <span key={tag} className="inline-flex items-center gap-2 rounded-full border border-[#143109]/15 bg-[#143109]/5 px-3 py-1 text-xs text-[#143109]">
              <span>{tag}</span>
              <span className="text-[#143109]/60">{count}</span>
              <button
                onClick={() => removeTagEverywhere(tag)}
                className="text-red-500 hover:text-red-700 transition-colors"
                aria-label={`Remove ${tag} from all recipes`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#143109]/10 bg-white/80">
        <table className="min-w-full divide-y divide-[#143109]/10">
          <thead className="bg-[#143109]/5 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 w-12">Pick</th>
              <th className="px-4 py-3 min-w-[220px]">Recipe</th>
              <th className="px-4 py-3 min-w-[280px]">Tags</th>
              <th className="px-4 py-3 min-w-[220px]">Quick add</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#143109]/10 text-sm">
            {filteredRecipes.map(recipe => (
              <tr key={recipe.id} className="align-top">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(recipe.id)}
                    onChange={() => toggleSelected(recipe.id)}
                    className="mt-1 accent-[#143109]"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{recipe.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{recipe.tags?.length || 0} tags</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(recipe.tags || []).length === 0 && <span className="text-xs text-gray-400">No tags</span>}
                    {(recipe.tags || []).map(tag => (
                      <TagPill
                        key={`${recipe.id}-${tag}`}
                        tag={tag}
                        onRemove={() => removeTagFromRecipe(recipe.id, tag)}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <input
                      value={rowTagInputs[recipe.id] || ''}
                      onChange={event => setRowTagInputs(prev => ({ ...prev, [recipe.id]: event.target.value }))}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          addTagToRecipe(recipe.id, rowTagInputs[recipe.id])
                        }
                      }}
                      placeholder="new tag"
                      className="flex-1 border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                    />
                    <button
                      onClick={() => addTagToRecipe(recipe.id, rowTagInputs[recipe.id])}
                      disabled={!normalizeTag(rowTagInputs[recipe.id])}
                      className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 disabled:opacity-40 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
