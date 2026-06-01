import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { fetchRecipes } from '../lib/github'
import TagPill from '../components/TagPill'

export default function RecipeList() {
  const location = useLocation()
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTags, setActiveTags] = useState(new Set())
  const notice = location.state?.actionNotice

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
      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{notice}</p>
          <p className="mt-1 text-amber-800">
            Follow deployment progress here:{' '}
            <a
              href="https://github.com/tlkaufmann/cookbook/actions/workflows/deploy.yml"
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              https://github.com/tlkaufmann/cookbook/actions/workflows/deploy.yml
            </a>
          </p>
        </div>
      )}

      <input
        type="search"
        placeholder="Search recipes or ingredients…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-[#143109]/20 rounded-lg px-4 py-2.5 text-sm
                   focus:outline-none focus:ring-2 focus:ring-[#143109]/20"
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
              className="text-xs text-[#143109] hover:opacity-80 ml-1 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">
            {recipes.length === 0 ? 'No recipes yet. Add your first one!' : 'No recipes match your filters.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(recipe => (
            <Link
              key={recipe.id}
              to={`/recipe/${recipe.id}`}
              className="block border border-[#143109]/15 rounded-lg p-4 bg-white/80
                         hover:border-[#143109]/35 transition-colors overflow-hidden"
            >
              {recipe.image && (
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-40 object-cover rounded-xl mb-3"
                />
              )}
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
                    <span className="text-xs text-[#143109]">+{recipe.tags.length - 3}</span>
                  )}
                </div>
                {((recipe.prep_min || 0) + (recipe.cook_min || 0)) > 0 && (
                  <span className="text-xs text-[#143109] shrink-0">
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