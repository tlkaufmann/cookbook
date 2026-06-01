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
        const numAmt = parseFloat(ing.amount)
        const hasAmt = !isNaN(numAmt) && numAmt > 0

        if (!totals[key]) {
          totals[key] = { name: ing.name, unit: ing.unit, amount: 0, hasAmount: false, conflict: false }
        }
        if (!hasAmt) continue

        if (totals[key].unit !== ing.unit && !totals[key].conflict) {
          totals[key].conflict = true
          totals[key].conflictNote = `${parseFloat(totals[key].amount.toFixed(2))}${totals[key].unit || ''} + ${parseFloat((numAmt * scale).toFixed(2))}${ing.unit || ''}`
        } else if (!totals[key].conflict) {
          totals[key].amount += numAmt * scale
          totals[key].hasAmount = true
        }
      }
    }
  }

  return Object.values(totals).sort((a, b) => a.name.localeCompare(b.name))
}

export default function ShoppingList() {
  const [recipes, setRecipes] = useState([])
  const [plan, setPlan] = useState({})
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
        : `${i.hasAmount ? `${parseFloat(i.amount.toFixed(2))}${i.unit ? ' ' + i.unit : ''} ` : ''}${i.name}`)
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
                  {item.hasAmount
                    ? `${parseFloat(item.amount.toFixed(2))}${item.unit ? ' ' + item.unit : ''}`
                    : '—'}
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