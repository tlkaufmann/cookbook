import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fetchRecipes } from '../lib/github'
import TagPill from '../components/TagPill'
import { getRecipeIngredientGroups } from '../lib/planner'

function formatAmount(amount, scale) {
  const n = parseFloat(amount)
  if (!n || isNaN(n)) return null
  const scaled = n * scale
  return parseFloat(scaled.toFixed(2))
}

export default function RecipeDetail() {
  const { id } = useParams()
  const [recipe, setRecipe] = useState(null)
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
  if (!recipe) return <p className="text-gray-500 text-sm mt-12 text-center">Recipe not found.</p>

  const scale = servings / recipe.servings
  const ingredientGroups = getRecipeIngredientGroups(recipe)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{recipe.title}</h1>
          <Link
            to={`/edit/${recipe.id}`}
            className="shrink-0 text-sm text-[#143109] hover:opacity-80
                       border border-[#143109]/20 rounded px-3 py-1 transition-colors"
          >
            Edit
          </Link>
        </div>

        {recipe.image && (
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-64 object-cover rounded-2xl"
          />
        )}

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
          {recipe.source && (
            <span>
              <a href={recipe.source} target="_blank" rel="noreferrer" className="font-semibold text-[#143109] hover:underline">
                Source
              </a>
            </span>
          )}
        </div>

        {/* Servings scaler */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-sm font-medium text-gray-700">Servings</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setServings(s => Math.max(1, s - 1))}
              className="w-7 h-7 rounded border border-[#143109]/20 text-[#143109]
                         hover:bg-[#143109]/5 flex items-center justify-center text-base leading-none"
            >
              −
            </button>
            <span className="w-6 text-center font-semibold text-gray-900 tabular-nums">
              {servings}
            </span>
            <button
              onClick={() => setServings(s => s + 1)}
              className="w-7 h-7 rounded border border-[#143109]/20 text-[#143109]
                         hover:bg-[#143109]/5 flex items-center justify-center text-base leading-none"
            >
              +
            </button>
          </div>
          {scale !== 1 && (
            <button
              onClick={() => setServings(recipe.servings)}
              className="text-xs text-[#143109] hover:opacity-80 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Ingredients & Steps */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="rounded-2xl border border-[#143109]/15 bg-white/80 p-4">
          <h2 className="font-semibold text-[#143109] mb-3 text-sm uppercase tracking-wide">
            Ingredients
          </h2>
          <div className="space-y-4">
            <div className="pb-3 border-b border-[#143109]/10">
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">Normal</h3>
              <ul className="space-y-2">
                {ingredientGroups.normal.map((ing, i) => {
                  const amt = formatAmount(ing.amount, scale)
                  return (
                    <li key={`normal-${i}`} className="flex gap-2 text-sm text-gray-700">
                      <span className="font-medium text-gray-500 shrink-0 tabular-nums">
                        {amt != null
                          ? `${amt}${ing.unit ? ` ${ing.unit}` : ''}`
                          : '—'}
                      </span>
                      <span className="text-gray-900">{ing.name}</span>
                    </li>
                  )
                })}
                {ingredientGroups.normal.length === 0 && (
                  <li className="text-sm text-gray-400">No normal ingredients.</li>
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2">Bulk / Pantry</h3>
              <ul className="space-y-2">
                {ingredientGroups.bulk.map((ing, i) => {
                  const amt = formatAmount(ing.amount, scale)
                  return (
                    <li key={`bulk-${i}`} className="flex gap-2 text-sm text-gray-700">
                      <span className="font-medium text-gray-500 shrink-0 tabular-nums">
                        {amt != null
                          ? `${amt}${ing.unit ? ` ${ing.unit}` : ''}`
                          : '—'}
                      </span>
                      <span className="text-gray-900">{ing.name}</span>
                    </li>
                  )
                })}
                {ingredientGroups.bulk.length === 0 && (
                  <li className="text-sm text-gray-400">No bulk/pantry ingredients.</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#143109]/15 bg-white/80 p-4">
          <h2 className="font-semibold text-[#143109] mb-3 text-sm uppercase tracking-wide">
            Steps
          </h2>
          <ol className="space-y-4">
            {recipe.steps?.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-gray-700 pl-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-[#143109] text-white
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