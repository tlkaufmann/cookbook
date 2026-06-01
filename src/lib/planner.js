function trimNumber(value) {
  return parseFloat(Number(value).toFixed(2)).toString()
}

export function makeClientId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getMonday(date) {
  const copy = new Date(date)
  const day = copy.getDay()
  copy.setDate(copy.getDate() - day + (day === 0 ? -6 : 1))
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function addDays(date, amount) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

export function toDateStr(date) {
  return date.toISOString().split('T')[0]
}

export function fmtDate(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function normalizeTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/,+/g, ' ')
    .replace(/\s+/g, ' ')
}

export function sortTags(tags) {
  return [...new Set(tags)].sort((left, right) => left.localeCompare(right))
}

export function sanitizeTagList(tags) {
  return sortTags((tags || []).map(normalizeTag).filter(Boolean))
}

export function filterRecipeTags(tags, allowedTags) {
  const allowed = new Set(sanitizeTagList(allowedTags))
  return sanitizeTagList(tags).filter(tag => allowed.has(tag))
}

function normalizeIngredientName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
}

function parseFraction(value) {
  const match = value.match(/^(\d+)\/(\d+)$/)
  if (!match) return null
  const numerator = Number(match[1])
  const denominator = Number(match[2])
  if (!denominator) return null
  return numerator / denominator
}

export function parseAmountValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw)

  const mixedMatch = raw.match(/^(\d+)\s+(\d+\/\d+)$/)
  if (mixedMatch) {
    const fraction = parseFraction(mixedMatch[2])
    return fraction == null ? null : Number(mixedMatch[1]) + fraction
  }

  const fraction = parseFraction(raw)
  if (fraction != null) return fraction
  return null
}

function formatScaledAmount(amount) {
  if (!Number.isFinite(amount)) return ''
  return trimNumber(amount)
}

export function createPlanEntry(recipe, servings) {
  return {
    id: makeClientId('meal'),
    recipe_id: recipe.id,
    servings,
  }
}

export function createShoppingItem(partial = {}) {
  return {
    id: partial.id || makeClientId('shop'),
    name: partial.name || '',
    amount: partial.amount || '',
    unit: partial.unit || '',
    note: partial.note || '',
    category: partial.category === 'bulk' ? 'bulk' : 'normal',
  }
}

export function buildShoppingListFromPlan(plan, recipes, dateRange) {
  const recipeMap = Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))
  const aggregated = new Map()
  const passthroughItems = []

  for (const dateKey of dateRange) {
    for (const entry of plan[dateKey] || []) {
      const recipe = recipeMap[entry.recipe_id]
      if (!recipe) continue

      const baseServings = Number(recipe.servings) || 1
      const targetServings = Number(entry.servings) || baseServings
      const scale = targetServings / baseServings

      for (const ingredient of recipe.ingredients || []) {
        const name = String(ingredient.name || '').trim()
        if (!name) continue

        const unit = String(ingredient.unit || '').trim()
        const normalizedName = normalizeIngredientName(name)
        const numericAmount = parseAmountValue(ingredient.amount)

        if (numericAmount == null) {
          passthroughItems.push(createShoppingItem({
            name,
            amount: String(ingredient.amount || '').trim(),
            unit,
            note: recipe.title,
            category: 'normal',
          }))
          continue
        }

        const key = `${normalizedName}__${unit.toLowerCase()}`
        const scaledAmount = numericAmount * scale
        const existing = aggregated.get(key)

        if (existing) {
          existing.amount = formatScaledAmount(Number(existing.amount) + scaledAmount)
          if (!existing.note.includes(recipe.title)) {
            existing.note = `${existing.note}, ${recipe.title}`
          }
          continue
        }

        aggregated.set(key, createShoppingItem({
          name,
          amount: formatScaledAmount(scaledAmount),
          unit,
          note: recipe.title,
          category: 'normal',
        }))
      }
    }
  }

  return [...aggregated.values(), ...passthroughItems].sort((left, right) => left.name.localeCompare(right.name))
}

export function formatShoppingItem(item) {
  const amount = String(item.amount || '').trim()
  const unit = String(item.unit || '').trim()
  const prefix = [amount, unit].filter(Boolean).join(' ')
  const suffix = String(item.note || '').trim()
  const base = [prefix, item.name].filter(Boolean).join(' ').trim()
  return suffix ? `${base} (${suffix})` : base
}

export function buildShoppingExport(items) {
  const normalizedItems = items
    .filter(item => String(item.name || '').trim())
    .map(createShoppingItem)

  const normalItems = normalizedItems.filter(item => item.category !== 'bulk')
  const bulkItems = normalizedItems.filter(item => item.category === 'bulk')

  const lines = []
  if (normalItems.length > 0) {
    lines.push('Normal')
    lines.push('------')
    lines.push(...normalItems.map(formatShoppingItem))
    lines.push('')
  }

  if (bulkItems.length > 0) {
    lines.push('Bulk / Pantry')
    lines.push('-------------')
    lines.push(...bulkItems.map(formatShoppingItem))
  }

  return lines.join('\n').trim()
}
