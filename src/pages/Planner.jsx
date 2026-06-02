import { useEffect, useMemo, useState } from 'react'
import { fetchRecipes } from '../lib/github'
import { consolidateShoppingItems } from '../lib/gemini'
import {
  addDays,
  buildShoppingExport,
  buildShoppingListFromPlan,
  createPlanEntry,
  createShoppingItem,
  fmtDate,
  getMonday,
  makeClientId,
  toDateStr,
} from '../lib/planner'
import { loadMealPlan, loadShoppingList, saveMealPlan, saveShoppingList } from '../lib/storage'

export default function Planner() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [recipes, setRecipes] = useState([])
  const [plan, setPlan] = useState(() => loadMealPlan())
  const [shoppingItems, setShoppingItems] = useState(() => loadShoppingList())
  const [loading, setLoading] = useState(true)
  const [pickerTarget, setPickerTarget] = useState(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [pickerServings, setPickerServings] = useState(2)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [consolidating, setConsolidating] = useState(false)
  const [consolidateError, setConsolidateError] = useState('')
  const [copied, setCopied] = useState(false)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dateRange = useMemo(() => weekDates.map(toDateStr), [weekDates])
  const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))

  useEffect(() => {
    fetchRecipes().then(data => {
      setRecipes(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    saveMealPlan(plan)
  }, [plan])

  useEffect(() => {
    saveShoppingList(shoppingItems)
  }, [shoppingItems])

  function getEntries(date) {
    return plan[toDateStr(date)] || []
  }

  function removeEntry(date, entryId) {
    const ds = toDateStr(date)
    setPlan(prev => ({
      ...prev,
      [ds]: (prev[ds] || []).filter(entry => entry.id !== entryId)
    }))
  }

  function updateEntryServings(date, entryId, nextServings) {
    const ds = toDateStr(date)
    setPlan(prev => ({
      ...prev,
      [ds]: (prev[ds] || []).map(entry => {
        if (entry.id !== entryId) return entry
        return { ...entry, servings: Math.max(1, nextServings) }
      })
    }))
  }

  function openPicker(date) {
    setPickerTarget({ date })
    setPickerSearch('')
    setSelectedRecipe(null)
    setPickerServings(2)
  }

  function confirmAdd() {
    if (!pickerTarget || !selectedRecipe) return
    const ds = toDateStr(pickerTarget.date)
    setPlan(prev => ({
      ...prev,
      [ds]: [...(prev[ds] || []), createPlanEntry(selectedRecipe, pickerServings)]
    }))
    setPickerTarget(null)
    setSelectedRecipe(null)
  }

  function generateShoppingList() {
    const nextItems = buildShoppingListFromPlan(plan, recipes, dateRange)
    setShoppingItems(nextItems)
  }

  function updateShoppingItem(itemId, key, value) {
    setShoppingItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return { ...item, [key]: value }
    }))
  }

  function addManualShoppingItem() {
    setShoppingItems(prev => [...prev, createShoppingItem({ id: makeClientId('shop'), category: 'normal' })])
  }

  function removeShoppingItem(itemId) {
    setShoppingItems(prev => prev.filter(item => item.id !== itemId))
  }

  async function handleConsolidate() {
    if (!geminiApiKey.trim() || shoppingItems.length === 0) return

    setConsolidating(true)
    setConsolidateError('')

    try {
      const mergedItems = await consolidateShoppingItems(
        shoppingItems.map(item => ({
          name: item.name,
          amount: item.amount,
          unit: item.unit,
          note: item.note,
          category: item.category,
        })),
        geminiApiKey
      )

      setShoppingItems(mergedItems.map(item => createShoppingItem(item)))
    } catch (error) {
      setConsolidateError(error.message)
    } finally {
      setConsolidating(false)
    }
  }

  function exportShoppingList() {
    const text = buildShoppingExport(shoppingItems)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `shopping-list-${dateRange[0]}.txt`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  async function copyShoppingList() {
    const text = buildShoppingExport(shoppingItems)
    if (!text.trim()) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  function clearShoppingList() {
    const confirmed = window.confirm('Clear the shopping list and calendar meals?')
    if (!confirmed) return
    setPlan({})
    setShoppingItems([])
    setConsolidateError('')
  }

  const normalItems = shoppingItems.filter(item => item.category !== 'bulk')
  const bulkItems = shoppingItems.filter(item => item.category === 'bulk')

  function renderShoppingSection(items, title, emptyText) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#143109]/15 px-4 py-5 text-sm text-gray-400">
            {emptyText}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <div
                key={item.id}
                className="grid gap-3 rounded-xl border border-[#143109]/10 px-3 py-3 md:grid-cols-[100px_90px_minmax(0,1fr)_minmax(0,220px)_110px_auto] bg-white"
              >
                <input
                  value={item.amount}
                  onChange={event => updateShoppingItem(item.id, 'amount', event.target.value)}
                  placeholder="amount"
                  className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                />
                <input
                  value={item.unit}
                  onChange={event => updateShoppingItem(item.id, 'unit', event.target.value)}
                  placeholder="unit"
                  className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                />
                <input
                  value={item.name}
                  onChange={event => updateShoppingItem(item.id, 'name', event.target.value)}
                  placeholder="shopping item"
                  className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                />
                <input
                  value={item.note}
                  onChange={event => updateShoppingItem(item.id, 'note', event.target.value)}
                  placeholder="note"
                  className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                />
                <select
                  value={item.category || 'normal'}
                  onChange={event => updateShoppingItem(item.id, 'category', event.target.value)}
                  className="border border-[#143109]/20 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
                >
                  <option value="normal">normal</option>
                  <option value="bulk">bulk</option>
                </select>
                <button
                  onClick={() => removeShoppingItem(item.id)}
                  className="text-red-500 hover:text-red-700 text-lg leading-none transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const pickerFiltered = pickerSearch
    ? recipes.filter(r => r.title.toLowerCase().includes(pickerSearch.toLowerCase()))
    : recipes

  if (loading) return <p className="text-gray-400 text-sm mt-12 text-center">Loading…</p>

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Planner</h1>
          <p className="text-sm text-gray-500 mt-1">
            Meals and shopping stay in this browser only. Recipe edits still deploy through GitHub.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generateShoppingList}
            className="bg-[#143109] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition-colors"
          >
            Generate shopping list
          </button>
          <button
            onClick={copyShoppingList}
            disabled={shoppingItems.length === 0}
            className="border border-[#143109]/20 rounded px-4 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={exportShoppingList}
            disabled={shoppingItems.length === 0}
            className="border border-[#143109]/20 rounded px-4 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 disabled:opacity-40 transition-colors"
          >
            Export .txt
          </button>
          <button
            onClick={clearShoppingList}
            className="border border-red-300 text-red-700 rounded px-4 py-2 text-sm hover:bg-red-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

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

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-7 gap-3 min-w-[840px]">
          {weekDates.map(date => (
            <div key={toDateStr(date)} className="rounded-2xl border border-[#143109]/10 bg-white/80 p-3 space-y-3 min-h-[240px]">
              <div className="pb-2 border-b border-[#143109]/10">
                <div className="text-sm font-semibold text-gray-800">{fmtDate(date)}</div>
                <div className="text-xs text-gray-400 mt-1">{getEntries(date).length} meals</div>
              </div>

              <div className="space-y-2">
                {getEntries(date).map(entry => {
                  const recipe = recipeMap[entry.recipe_id]
                  if (!recipe) return null

                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl border border-[#143109]/10 bg-[#143109]/5 px-3 py-2 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{recipe.title}</p>
                        <button
                          onClick={() => removeEntry(date, entry.id)}
                          className="text-gray-300 hover:text-red-500 text-lg leading-none transition-colors"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">Servings</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateEntryServings(date, entry.id, entry.servings - 1)}
                            className="w-6 h-6 rounded border border-[#143109]/20 text-sm flex items-center justify-center hover:bg-white transition-colors"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{entry.servings}</span>
                          <button
                            onClick={() => updateEntryServings(date, entry.id, entry.servings + 1)}
                            className="w-6 h-6 rounded border border-[#143109]/20 text-sm flex items-center justify-center hover:bg-white transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <button
                onClick={() => openPicker(date)}
                className="text-sm text-[#143109] hover:opacity-80 transition-colors"
              >
                + Add meal
              </button>
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-[#143109]/10 bg-white/80 p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Shopping list</h2>
            <p className="text-sm text-gray-500 mt-1">
              Generate from this week, tidy it manually, then optionally ask Gemini Flash to merge near-duplicates.
            </p>
          </div>
          <div className="w-full max-w-md space-y-2">
            <input
              type="password"
              value={geminiApiKey}
              onChange={event => setGeminiApiKey(event.target.value)}
              placeholder="Gemini API key for optional consolidation"
              className="w-full border border-[#143109]/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
            />
            <button
              onClick={handleConsolidate}
              disabled={!geminiApiKey || shoppingItems.length === 0 || consolidating}
              className="w-full border border-[#143109]/20 rounded-lg px-3 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 disabled:opacity-40 transition-colors"
            >
              {consolidating ? 'Consolidating…' : 'Use Gemini Flash to merge similar items'}
            </button>
          </div>
        </div>

        {consolidateError && <p className="text-sm text-red-500">{consolidateError}</p>}

        {shoppingItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#143109]/15 px-4 py-8 text-center text-sm text-gray-400">
            Generate a list from the current week or add items manually.
          </div>
        ) : (
          <div className="space-y-6">
            {renderShoppingSection(normalItems, 'Normal', 'No normal items yet.')}
            {renderShoppingSection(bulkItems, 'Bulk / Pantry', 'No bulk items yet.')}
          </div>
        )}

        <div className="pt-1">
          <button
            onClick={addManualShoppingItem}
            className="border border-[#143109]/20 rounded px-4 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 transition-colors"
          >
            Add shopping item
          </button>
        </div>
      </section>

      {pickerTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-sm space-y-3 shadow-2xl">
            <h3 className="font-semibold text-gray-900">Add meal — {fmtDate(pickerTarget.date)}</h3>
            <input autoFocus value={pickerSearch}
              onChange={e => { setPickerSearch(e.target.value); setSelectedRecipe(null) }}
              placeholder="Search recipes…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-gray-300" />
            <div className="max-h-48 overflow-y-auto rounded border border-gray-100 divide-y divide-gray-50">
              {pickerFiltered.length === 0
                ? <p className="px-3 py-3 text-sm text-gray-400">No recipes found</p>
                : pickerFiltered.map(r => (
                    <button key={r.id} onClick={() => { setSelectedRecipe(r); setPickerServings(r.servings || 1) }}
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