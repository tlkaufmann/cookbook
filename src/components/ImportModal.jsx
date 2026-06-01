import { useEffect, useState } from 'react'
import { fetchHTML, extractRecipeFromHTML, validateRecipe, Logger } from '../lib/gemini'
import { fetchTags, getTags, updateRecipes } from '../lib/github'
import { filterRecipeTags, getRecipeIngredientGroups, sanitizeTagList } from '../lib/planner'

function blankIngredient() {
  return { amount: '', unit: '', name: '' }
}

function LogViewer({ logs, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] shadow-lg flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">Import Log</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-950 p-4">
          <pre className="text-xs font-mono text-gray-100 whitespace-pre-wrap break-words">
            {logs}
          </pre>
        </div>
        <div className="border-t border-gray-200 px-6 py-3 flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(logs)
              alert('Log copied to clipboard!')
            }}
            className="flex-1 bg-gray-100 text-gray-900 py-2 rounded text-sm font-medium
                       hover:bg-gray-200 transition-colors"
          >
            Copy Log
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-[#143109] text-white py-2 rounded text-sm font-medium
                       hover:opacity-90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ImportModal({ onClose, onSuccess }) {
  const [apiKey, setApiKey] = useState('')
  const [urlsInput, setUrlsInput] = useState('')
  const [availableTags, setAvailableTags] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewRecipes, setReviewRecipes] = useState([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [hasReviewSession, setHasReviewSession] = useState(false)

  const urls = urlsInput
    .split('\n')
    .map(url => url.trim())
    .filter(url => url && /^https?:\/\//.test(url))

  const successfulResults = results.filter(r => r.status === 'success' && r.recipe)
  const failedResults = results.filter(r => r.status === 'error')
  const currentRecipe = reviewRecipes[reviewIndex] || null

  useEffect(() => {
    let alive = true

    async function loadTags() {
      try {
        const { data } = await getTags()
        const normalized = sanitizeTagList(data || [])
        if (normalized.length > 0) {
          if (!alive) return
          setAvailableTags(normalized)
          return
        }

        const publicData = await fetchTags()
        if (!alive) return
        setAvailableTags(sanitizeTagList(publicData || []))
      } catch {
        try {
          const data = await fetchTags()
          if (!alive) return
          setAvailableTags(sanitizeTagList(data || []))
        } catch {
          if (!alive) return
          setAvailableTags([])
        }
      }
    }

    loadTags()
    return () => {
      alive = false
    }
  }, [])

  function cloneRecipe(recipe) {
    const ingredientGroups = getRecipeIngredientGroups(recipe)
    return {
      ...recipe,
      tags: filterRecipeTags(recipe.tags || [], availableTags),
      ingredients_normal: ingredientGroups.normal.length > 0
        ? ingredientGroups.normal.map(ing => ({
            amount: ing?.amount ?? '',
            unit: ing?.unit ?? '',
            name: ing?.name ?? '',
          }))
        : [blankIngredient()],
      ingredients_bulk: ingredientGroups.bulk.map(ing => ({
        amount: ing?.amount ?? '',
        unit: ing?.unit ?? '',
        name: ing?.name ?? '',
      })),
      steps: Array.isArray(recipe.steps) ? [...recipe.steps] : [''],
      description: recipe.description || '',
    }
  }

  function startReview(importResults) {
    const ok = importResults
      .filter(r => r.status === 'success' && r.recipe)
      .map(r => cloneRecipe(r.recipe))

    if (ok.length === 0) return

    setReviewRecipes(ok)
    setReviewIndex(0)
    setHasReviewSession(true)
    setReviewMode(true)
  }

  function updateCurrentRecipe(updater) {
    setReviewRecipes(prev =>
      prev.map((recipe, i) => (i === reviewIndex ? updater(recipe) : recipe))
    )
  }

  function updateIngredient(section, i, key, value) {
    updateCurrentRecipe(recipe => {
      const ingredients = [...(recipe[section] || [])]
      ingredients[i] = { ...ingredients[i], [key]: value }
      return { ...recipe, [section]: ingredients }
    })
  }

  function updateStep(i, value) {
    updateCurrentRecipe(recipe => {
      const steps = [...(recipe.steps || [])]
      steps[i] = value
      return { ...recipe, steps }
    })
  }

  async function handleImport() {
    if (!apiKey.trim()) {
      alert('Please enter your Gemini API key')
      return
    }
    if (urls.length === 0) {
      alert('Please enter at least one URL')
      return
    }

    setIsProcessing(true)
    setResults([])
    setReviewMode(false)
    setReviewRecipes([])
    setReviewIndex(0)
    setHasReviewSession(false)

    const finalResults = []

    for (const url of urls) {
      const logger = new Logger(url)
      const result = {
        url,
        status: 'loading',
        recipe: null,
        error: null,
        logger,
      }
      setResults(prev => [...prev, result])

      try {
        logger.log(`Starting HTML fetch`)
        const html = await fetchHTML(url, logger)

        logger.log(`Starting recipe extraction`)
        const recipe = await extractRecipeFromHTML(html, url, apiKey, logger, availableTags)

        logger.log(`Starting validation`)
        validateRecipe(recipe, logger)

        logger.log(`✅ SUCCESS: Recipe imported successfully`)
        finalResults.push({ ...result, status: 'success', recipe })
        setResults(prev =>
          prev.map(r =>
            r.url === url ? { ...r, status: 'success', recipe } : r
          )
        )
      } catch (err) {
        const error = err.message || 'Unknown error'
        logger.log(`❌ FAILED: ${error}`)
        finalResults.push({ ...result, status: 'error', error })
        setResults(prev =>
          prev.map(r =>
            r.url === url ? { ...r, status: 'error', error } : r
          )
        )
      }
    }

    setIsProcessing(false)
    setResults(finalResults)
    startReview(finalResults)
  }

  async function handleAddRecipes() {
    if (!reviewMode || !hasReviewSession || reviewRecipes.length === 0) {
      alert('Please review imported recipes before adding them')
      return
    }

    const recipesToAdd = reviewRecipes.map(recipe => ({
      ...recipe,
      title: String(recipe.title || '').trim(),
      description: String(recipe.description || '').trim(),
      servings: Number(recipe.servings) > 0 ? Number(recipe.servings) : 1,
      prep_min: Number(recipe.prep_min) >= 0 ? Number(recipe.prep_min) : 0,
      cook_min: Number(recipe.cook_min) >= 0 ? Number(recipe.cook_min) : 0,
      tags: Array.isArray(recipe.tags)
        ? filterRecipeTags(recipe.tags, availableTags)
        : [],
      ingredients_normal: Array.isArray(recipe.ingredients_normal)
        ? recipe.ingredients_normal
            .map(ing => ({
              amount: ing?.amount ?? '',
              unit: String(ing?.unit ?? '').trim(),
              name: String(ing?.name ?? '').trim(),
            }))
            .filter(ing => ing.name)
        : [],
      ingredients_bulk: Array.isArray(recipe.ingredients_bulk)
        ? recipe.ingredients_bulk
            .map(ing => ({
              amount: ing?.amount ?? '',
              unit: String(ing?.unit ?? '').trim(),
              name: String(ing?.name ?? '').trim(),
            }))
            .filter(ing => ing.name)
        : [],
      steps: Array.isArray(recipe.steps)
        ? recipe.steps.map(s => String(s || '').trim()).filter(Boolean)
        : [],
    }))

    if (recipesToAdd.length === 0) {
      alert('No recipes to add')
      return
    }

    try {
      await updateRecipes(recipes => {
        const newRecipes = recipesToAdd.map(recipe => ({
          ...recipe,
          id: Date.now().toString() + Math.random(),
          created_at: new Date().toISOString(),
        }))
        return [...recipes, ...newRecipes]
      })
      onSuccess()
      onClose()
    } catch (err) {
      alert(`Failed to save recipes: ${err.message}`)
    }
  }

  function toggleReviewTag(tag) {
    updateCurrentRecipe(recipe => {
      const hasTag = (recipe.tags || []).includes(tag)
      if (hasTag) {
        return {
          ...recipe,
          tags: (recipe.tags || []).filter(t => t !== tag),
        }
      }

      return {
        ...recipe,
        tags: sanitizeTagList([...(recipe.tags || []), tag]),
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-lg">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Import Recipe</h2>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-50 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="px-6 py-4 space-y-4">
            {reviewMode && currentRecipe && (
              <div className="space-y-4">
                <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setReviewIndex(i => Math.max(0, i - 1))}
                      disabled={reviewIndex === 0 || isProcessing}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-800
                                 hover:bg-gray-100 disabled:opacity-40"
                    >
                      ← Prev
                    </button>
                    <p className="text-sm font-medium text-gray-700">
                      Recipe {reviewIndex + 1} of {reviewRecipes.length}
                    </p>
                    <button
                      onClick={() => setReviewIndex(i => Math.min(reviewRecipes.length - 1, i + 1))}
                      disabled={reviewIndex === reviewRecipes.length - 1 || isProcessing}
                      className="px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-800
                                 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Next →
                    </button>
                  </div>

                  <button
                    onClick={handleAddRecipes}
                    disabled={isProcessing || reviewRecipes.length === 0}
                    className="w-full bg-[#143109] text-white py-2 rounded text-sm font-semibold
                               hover:opacity-90 disabled:opacity-40 transition-colors"
                  >
                    Add {reviewRecipes.length} Recipe{reviewRecipes.length !== 1 ? 's' : ''}
                  </button>
                </div>

                <div className="space-y-3 border rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Manual Review</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                    <input
                      value={currentRecipe.title || ''}
                      onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea
                      value={currentRecipe.description || ''}
                      onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, description: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Servings</label>
                      <input
                        type="number"
                        min="1"
                        value={currentRecipe.servings ?? ''}
                        onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, servings: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Prep (min)</label>
                      <input
                        type="number"
                        min="0"
                        value={currentRecipe.prep_min ?? ''}
                        onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, prep_min: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Cook (min)</label>
                      <input
                        type="number"
                        min="0"
                        value={currentRecipe.cook_min ?? ''}
                        onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, cook_min: e.target.value }))}
                        className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">Tags</label>
                    {availableTags.length === 0 ? (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        No tags available. Add tags in the Tags tab first.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {availableTags.map(tag => {
                          const active = (currentRecipe.tags || []).includes(tag)
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleReviewTag(tag)}
                              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                                active
                                  ? 'bg-[#143109] text-white border-[#143109]'
                                  : 'bg-white text-[#143109] border-[#143109]/30 hover:bg-[#143109]/5'
                              }`}
                            >
                              {tag}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-600">Ingredients (Normal)</label>
                        <button
                          onClick={() =>
                            updateCurrentRecipe(recipe => ({
                              ...recipe,
                              ingredients_normal: [...(recipe.ingredients_normal || []), blankIngredient()],
                            }))
                          }
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          + Add Normal
                        </button>
                      </div>

                      {(currentRecipe.ingredients_normal || []).map((ing, i) => (
                        <div key={`normal-${i}`} className="grid grid-cols-[1fr_1fr_3fr_auto] gap-2">
                          <input
                            placeholder="Amount"
                            value={ing.amount ?? ''}
                            onChange={e => updateIngredient('ingredients_normal', i, 'amount', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <input
                            placeholder="Unit"
                            value={ing.unit || ''}
                            onChange={e => updateIngredient('ingredients_normal', i, 'unit', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <input
                            placeholder="Ingredient name"
                            value={ing.name || ''}
                            onChange={e => updateIngredient('ingredients_normal', i, 'name', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <button
                            onClick={() =>
                              updateCurrentRecipe(recipe => ({
                                ...recipe,
                                ingredients_normal: (recipe.ingredients_normal || []).filter((_, idx) => idx !== i),
                              }))
                            }
                            className="px-2 rounded border border-red-200 text-red-700 text-xs hover:bg-red-50"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-600">Ingredients (Bulk / Pantry)</label>
                        <button
                          onClick={() =>
                            updateCurrentRecipe(recipe => ({
                              ...recipe,
                              ingredients_bulk: [...(recipe.ingredients_bulk || []), blankIngredient()],
                            }))
                          }
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                        >
                          + Add Bulk
                        </button>
                      </div>

                      {(currentRecipe.ingredients_bulk || []).map((ing, i) => (
                        <div key={`bulk-${i}`} className="grid grid-cols-[1fr_1fr_3fr_auto] gap-2">
                          <input
                            placeholder="Amount"
                            value={ing.amount ?? ''}
                            onChange={e => updateIngredient('ingredients_bulk', i, 'amount', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <input
                            placeholder="Unit"
                            value={ing.unit || ''}
                            onChange={e => updateIngredient('ingredients_bulk', i, 'unit', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <input
                            placeholder="Ingredient name"
                            value={ing.name || ''}
                            onChange={e => updateIngredient('ingredients_bulk', i, 'name', e.target.value)}
                            className="border border-gray-200 rounded px-2 py-1.5 text-sm"
                          />
                          <button
                            onClick={() =>
                              updateCurrentRecipe(recipe => ({
                                ...recipe,
                                ingredients_bulk: (recipe.ingredients_bulk || []).filter((_, idx) => idx !== i),
                              }))
                            }
                            className="px-2 rounded border border-red-200 text-red-700 text-xs hover:bg-red-50"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-600">Steps</label>
                      <button
                        onClick={() =>
                          updateCurrentRecipe(recipe => ({
                            ...recipe,
                            steps: [...(recipe.steps || []), ''],
                          }))
                        }
                        className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100"
                      >
                        + Add Step
                      </button>
                    </div>

                    {(currentRecipe.steps || []).map((step, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <p className="text-xs text-gray-500 mt-2 w-5">{i + 1}.</p>
                        <textarea
                          value={step}
                          onChange={e => updateStep(i, e.target.value)}
                          rows={2}
                          className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm"
                        />
                        <button
                          onClick={() =>
                            updateCurrentRecipe(recipe => ({
                              ...recipe,
                              steps: (recipe.steps || []).filter((_, idx) => idx !== i),
                            }))
                          }
                          className="px-2 py-1 mt-0.5 rounded border border-red-200 text-red-700 text-xs hover:bg-red-50"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                    <input
                      value={currentRecipe.image || ''}
                      onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, image: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                      placeholder="https://images.example.com/photo.jpg"
                    />
                    {currentRecipe.image && /^https?:\/\//.test(currentRecipe.image) && (
                      <div className="mt-2 flex items-center gap-2">
                        <img
                          src={currentRecipe.image}
                          alt="Imported recipe preview"
                          loading="lazy"
                          className="h-14 w-14 rounded border border-gray-200 object-cover"
                          onError={e => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                        <a
                          href={currentRecipe.image}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#143109] hover:underline break-all"
                        >
                          Open image
                        </a>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Source URL</label>
                    <input
                      value={currentRecipe.source || ''}
                      onChange={e => updateCurrentRecipe(recipe => ({ ...recipe, source: e.target.value }))}
                      className="w-full border border-gray-200 rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {failedResults.length > 0 && (
                  <div className="space-y-2 border rounded-lg p-3 bg-red-50">
                    <p className="text-sm font-medium text-red-800">
                      {failedResults.length} import{failedResults.length !== 1 ? 's' : ''} failed
                    </p>
                    {failedResults.map((result, i) => (
                      <button
                        key={i}
                        onClick={() => result.logger && setSelectedLog(result.logger.getLogs())}
                        className="w-full text-left border border-red-200 rounded p-2 bg-white hover:shadow-sm"
                      >
                        <p className="text-xs text-red-700 font-medium">{result.error}</p>
                        <p className="text-xs text-gray-500 break-all mt-1">{result.url}</p>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => {
                      setReviewMode(false)
                      setReviewRecipes([])
                      setReviewIndex(0)
                      setHasReviewSession(false)
                      setResults([])
                      setUrlsInput('')
                    }}
                    className="flex-1 bg-white text-gray-700 border border-gray-200 py-2 rounded text-sm font-medium
                               hover:bg-gray-50 transition-colors"
                  >
                    Import More
                  </button>
                  <button
                    onClick={handleAddRecipes}
                    disabled={isProcessing || reviewRecipes.length === 0}
                    className="flex-1 bg-[#143109] text-white py-2 rounded text-sm font-medium
                               hover:opacity-90 disabled:opacity-40 transition-colors"
                  >
                    Add {reviewRecipes.length} Recipe{reviewRecipes.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}

            {!reviewMode && (
              <>
            {/* API Key Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gemini API Key <span className="text-xs text-gray-500">(not stored)</span>
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Your Gemini Flash API key"
                disabled={isProcessing}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Get key from{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#143109] hover:underline"
                >
                  aistudio.google.com
                </a>
              </p>
            </div>

            {/* URLs Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipe URLs <span className="text-xs text-gray-500">({urls.length})</span>
              </label>
              <textarea
                value={urlsInput}
                onChange={e => setUrlsInput(e.target.value)}
                placeholder="https://example.com/recipe-1&#10;https://example.com/recipe-2&#10;..."
                rows={4}
                disabled={isProcessing}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:bg-gray-50 font-mono"
              />
            </div>

            {/* Import Button */}
            {results.length === 0 && (
              <button
                onClick={handleImport}
                disabled={!apiKey || urls.length === 0 || isProcessing}
                className="w-full bg-[#143109] text-white py-2 rounded font-medium text-sm
                           hover:opacity-90 disabled:opacity-40 transition-colors"
              >
                {isProcessing ? 'Importing…' : `Import ${urls.length} Recipe${urls.length !== 1 ? 's' : ''}`}
              </button>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-900 border-t pt-4">
                  Results
                </div>

                {results.map((result, i) => (
                  <button
                    key={i}
                    onClick={() => result.logger && setSelectedLog(result.logger.getLogs())}
                    className={`w-full border rounded p-3 text-left transition-all ${
                      result.status === 'success'
                        ? 'bg-green-50 border-green-200 hover:shadow-md'
                        : result.status === 'error'
                        ? 'bg-red-50 border-red-200 hover:shadow-md hover:border-red-400'
                        : 'bg-blue-50 border-blue-200 animate-pulse'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="text-lg mt-0.5 shrink-0">
                        {result.status === 'success' && '✅'}
                        {result.status === 'error' && '❌'}
                        {result.status === 'loading' && '⏳'}
                      </div>
                      <div className="flex-1 min-w-0">
                        {result.recipe && (
                          <p className="font-medium text-gray-900 break-words">
                            {result.recipe.title}
                          </p>
                        )}
                        {result.error && (
                          <>
                            <p className="text-sm text-red-700 font-medium mb-0.5">
                              {result.error}
                            </p>
                            <p className="text-xs text-red-600">
                              Click to view full log
                            </p>
                          </>
                        )}
                        <p className="text-xs text-gray-500 break-all mt-1">
                          {result.url}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}

                {/* Action Buttons */}
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={() => {
                      setHasReviewSession(false)
                      setResults([])
                      setUrlsInput('')
                    }}
                    disabled={isProcessing}
                    className="flex-1 bg-white text-gray-700 border border-gray-200 py-2 rounded text-sm font-medium
                               hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Import More
                  </button>
                  <button
                    onClick={() => startReview(results)}
                    disabled={isProcessing || successfulResults.length === 0}
                    className="flex-1 bg-[#143109] text-white py-2 rounded text-sm font-medium
                               hover:opacity-90 disabled:opacity-40 transition-colors"
                  >
                    Review {successfulResults.length} Recipe
                    {successfulResults.length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </div>

      {selectedLog && (
        <LogViewer logs={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  )
}
