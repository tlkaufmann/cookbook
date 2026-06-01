import { useState, useEffect } from 'react'
import { fetchRecipes, getMealPlan, updateMealPlan } from '../lib/github'

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
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [recipes, setRecipes] = useState([])
  const [plan, setPlan] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  // Picker
  const [pickerTarget, setPickerTarget] = useState(null) // { date, slot }
  const [pickerSearch, setPickerSearch] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [pickerServings, setPickerServings] = useState(2)

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const recipeMap = Object.fromEntries(recipes.map(r => [r.id, r]))

  useEffect(() => {
    fetchRecipes().then(setRecipes)
    getMealPlan().then(({ data }) => { setPlan(data) })
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
      await updateMealPlan(() => plan)
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