import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchTags, getRecipes, getTags, updateRecipes } from '../lib/github'
import TagPill from '../components/TagPill'
import { filterRecipeTags, getRecipeIngredientGroups, sanitizeTagList } from '../lib/planner'

const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', '']

function blankIngredient() { return { amount: '', unit: 'g', name: '' } }
function blankRecipe() {
  return {
    title: '', description: '', servings: 2,
    prep_min: 0, cook_min: 0, tags: [],
    ingredients_normal: [blankIngredient()],
    ingredients_bulk: [],
    steps: [''], source: '', image: '',
  }
}

export default function RecipeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditing = !!id

  const [form, setForm] = useState(blankRecipe())
  const [selectedTag, setSelectedTag] = useState('')
  const [allTags, setAllTags] = useState([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isEditing)

  useEffect(() => {
    let alive = true

    Promise.all([getRecipes(), getTags()])
      .then(([recipesResponse, tagsResponse]) => {
        if (!alive) return

        const recipes = recipesResponse.data || []
        const initialAllowed = sanitizeTagList(tagsResponse.data || [])

        const applyTags = allowedTags => {
          setAllTags(allowedTags)

          if (isEditing) {
            const recipe = recipes.find(r => r.id === id)
            if (recipe) {
              const ingredientGroups = getRecipeIngredientGroups(recipe)
              setForm({
                ...recipe,
                tags: filterRecipeTags(recipe.tags || [], allowedTags),
                ingredients_normal: ingredientGroups.normal.length > 0 ? ingredientGroups.normal : [blankIngredient()],
                ingredients_bulk: ingredientGroups.bulk,
              })
            }
          }
        }

        if (initialAllowed.length > 0) {
          applyTags(initialAllowed)
          return
        }

        fetchTags()
          .then(publicTags => {
            if (!alive) return
            applyTags(sanitizeTagList(publicTags || []))
          })
          .catch(() => {
            if (!alive) return
            applyTags(initialAllowed)
          })
      })
      .catch(loadError => {
        if (!alive) return
        setError(loadError.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [id, isEditing])

  function field(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Ingredient helpers
  function setIng(section, i, key, value) {
    setForm(prev => {
      const ingredients = [...(prev[section] || [])]
      ingredients[i] = { ...ingredients[i], [key]: value }
      return { ...prev, [section]: ingredients }
    })
  }
  function addIng(section) {
    setForm(prev => ({ ...prev, [section]: [...(prev[section] || []), blankIngredient()] }))
  }
  function removeIng(section, i) {
    setForm(prev => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, idx) => idx !== i),
    }))
  }

  // Step helpers
  function setStep(i, value) {
    setForm(prev => { const steps = [...prev.steps]; steps[i] = value; return { ...prev, steps } })
  }
  function addStep() { setForm(prev => ({ ...prev, steps: [...prev.steps, ''] })) }
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
  function addTag(tag) {
    if (!tag || form.tags.includes(tag)) return
    setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }))
    setSelectedTag('')
  }
  function removeTag(tag) { setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) })) }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError('')
    try {
      const allowedTagSet = new Set(allTags)
      const tags = sanitizeTagList(form.tags).filter(tag => allowedTagSet.has(tag))
      const ingredientsNormal = (form.ingredients_normal || [])
        .map(ing => ({
          amount: ing?.amount ?? '',
          unit: String(ing?.unit ?? '').trim(),
          name: String(ing?.name ?? '').trim(),
        }))
        .filter(ing => ing.name)
      const ingredientsBulk = (form.ingredients_bulk || [])
        .map(ing => ({
          amount: ing?.amount ?? '',
          unit: String(ing?.unit ?? '').trim(),
          name: String(ing?.name ?? '').trim(),
        }))
        .filter(ing => ing.name)

      const payload = {
        ...form,
        tags,
        ingredients_normal: ingredientsNormal,
        ingredients_bulk: ingredientsBulk,
      }
      delete payload.ingredients

      let targetId = id
      await updateRecipes(recipes => {
        if (isEditing) {
          return recipes.map(r => r.id === id ? { ...payload, id } : r)
        } else {
          targetId = Date.now().toString()
          return [...recipes, { ...payload, id: targetId, created_at: new Date().toISOString() }]
        }
      })
      sessionStorage.setItem(
        'deployNotice',
        isEditing
          ? 'Recipe updated — the site is redeploying and will reflect changes in 1–2 minutes.'
          : 'Recipe added — the site is redeploying and will appear in 1–2 minutes.'
      )
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!isEditing) return
    const confirmed = window.confirm('Delete this recipe?')
    if (!confirmed) return

    setDeleting(true)
    setError('')

    try {
      await updateRecipes(recipes => recipes.filter(r => r.id !== id))

      sessionStorage.setItem(
        'deployNotice',
        'Recipe deleted — the site is redeploying and will reflect changes in 1–2 minutes.'
      )
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (loading) return <p className="text-gray-400 text-sm mt-12 text-center">Loading…</p>

  const inputCls = 'w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300'

  return (
    <div className="space-y-8 pb-16">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>
        <div className="flex items-center gap-2">
          {isEditing && (
            <button
              onClick={handleDelete}
              disabled={saving || deleting}
              className="bg-white text-red-600 border border-red-200 px-4 py-2 rounded text-sm font-medium
                         hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="bg-[#143109] text-white px-4 py-2 rounded text-sm font-medium
                       hover:opacity-90 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Recipe'}
          </button>
        </div>
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
            className={inputCls} placeholder="https://example.com" />
          {form.source && /^https?:\/\//.test(form.source) && (
            <a
              href={form.source}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-[#143109] hover:underline break-all"
            >
              Open source link
            </a>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input value={form.image || ''} onChange={e => field('image', e.target.value)}
            className={inputCls} placeholder="https://images.example.com/photo.jpg" />
          {form.image && /^https?:\/\//.test(form.image) && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={form.image}
                alt="Recipe preview"
                loading="lazy"
                className="h-16 w-16 rounded border border-gray-200 object-cover"
                onError={e => {
                  e.currentTarget.style.display = 'none'
                }}
              />
              <a
                href={form.image}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#143109] hover:underline break-all"
              >
                Open image
              </a>
            </div>
          )}
        </div>
      </section>

      {/* Tags */}
      <section>
        <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {form.tags.map(tag => <TagPill key={tag} tag={tag} onRemove={removeTag} />)}
        </div>
        <div className="flex gap-2">
          <select
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="">Select existing tag</option>
            {allTags
              .filter(tag => !form.tags.includes(tag))
              .map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => addTag(selectedTag)}
            disabled={!selectedTag}
            className="border border-[#143109]/20 rounded-lg px-3 py-2 text-sm text-[#143109] hover:bg-[#143109]/5 disabled:opacity-40 transition-colors"
          >
            Add tag
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Create new tags in the Tags tab.</p>
      </section>

      {/* Ingredients */}
      <section className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients (Normal)</label>
          <div className="space-y-2">
            {(form.ingredients_normal || []).map((ing, i) => (
              <div key={`normal-${i}`} className="flex gap-2 items-center">
                <input type="number" min="0" step="any" value={ing.amount}
                  onChange={e => setIng('ingredients_normal', i, 'amount', e.target.value)}
                  placeholder="Qty"
                  className="w-20 border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                <select value={ing.unit} onChange={e => setIng('ingredients_normal', i, 'unit', e.target.value)}
                  className="border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                  {UNITS.map(u => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
                <input value={ing.name} onChange={e => setIng('ingredients_normal', i, 'name', e.target.value)}
                  placeholder="Ingredient"
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                <button type="button" onClick={() => removeIng('ingredients_normal', i)}
                  className="text-gray-300 hover:text-red-400 text-xl leading-none transition-colors">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addIng('ingredients_normal')}
            className="mt-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            + Add normal ingredient
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Ingredients (Bulk / Pantry)</label>
          <div className="space-y-2">
            {(form.ingredients_bulk || []).map((ing, i) => (
              <div key={`bulk-${i}`} className="flex gap-2 items-center">
                <input type="number" min="0" step="any" value={ing.amount}
                  onChange={e => setIng('ingredients_bulk', i, 'amount', e.target.value)}
                  placeholder="Qty"
                  className="w-20 border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                <select value={ing.unit} onChange={e => setIng('ingredients_bulk', i, 'unit', e.target.value)}
                  className="border border-gray-200 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300">
                  {UNITS.map(u => <option key={u} value={u}>{u || '—'}</option>)}
                </select>
                <input value={ing.name} onChange={e => setIng('ingredients_bulk', i, 'name', e.target.value)}
                  placeholder="Ingredient"
                  className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                <button type="button" onClick={() => removeIng('ingredients_bulk', i)}
                  className="text-gray-300 hover:text-red-400 text-xl leading-none transition-colors">×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addIng('ingredients_bulk')}
            className="mt-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            + Add bulk/pantry ingredient
          </button>
        </div>
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
      <div className="flex gap-2">
        {isEditing && (
          <button onClick={handleDelete} disabled={saving || deleting}
            className="flex-1 bg-white text-red-600 border border-red-200 py-3 rounded font-medium
                       hover:bg-red-50 disabled:opacity-40 transition-colors">
            {deleting ? 'Deleting…' : 'Delete Recipe'}
          </button>
        )}
        <button onClick={handleSave} disabled={saving || deleting}
          className="flex-[2] bg-[#143109] text-white py-3 rounded font-medium
                     hover:opacity-90 disabled:opacity-40 transition-colors">
          {saving ? 'Saving…' : 'Save Recipe'}
        </button>
      </div>
    </div>
  )
}