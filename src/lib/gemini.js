const CORS_PROXY = 'https://api.allorigins.win/raw?url='
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]
const FETCH_TIMEOUT_MS = 20000
const MAX_MODEL_INPUT_CHARS = 25000

/**
 * Simple logger class to capture all operations
 */
export class Logger {
  constructor(url) {
    this.url = url
    this.logs = []
    this.log(`Starting import for: ${url}`)
  }

  log(message, data = null) {
    const timestamp = new Date().toLocaleTimeString()
    let entry = `[${timestamp}] ${message}`
    if (data) {
      if (typeof data === 'object') {
        entry += '\n' + JSON.stringify(data, null, 2)
      } else {
        entry += '\n' + String(data)
      }
    }
    this.logs.push(entry)
  }

  getLogs() {
    return this.logs.join('\n\n')
  }

  getLogsAsArray() {
    return [...this.logs]
  }
}

const RECIPE_SCHEMA = {
  title: 'string',
  description: 'string',
  servings: 'number',
  prep_min: 'number',
  cook_min: 'number',
  tags: 'array of strings',
  ingredients: [
    {
      amount: 'number or string',
      unit: 'string (g, ml, tsp, tbsp, cup, oz, lb, or empty)',
      name: 'string',
    },
  ],
  steps: 'array of strings',
  source: 'URL where this recipe was found',
  image: 'URL of main recipe image (from og:image if available)',
}

/**
 * Extract Open Graph image URL from HTML
 */
function extractOGImage(html) {
  const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
  if (ogImageMatch?.[1]) return ogImageMatch[1]
  return null
}

function parseImageSizeHints(url) {
  const hints = { width: 0, height: 0 }
  if (!url) return hints

  const resizeMatch = url.match(/(?:resize|size)=([0-9]{2,4})[,x]([0-9]{2,4})/i)
  if (resizeMatch) {
    hints.width = Number(resizeMatch[1]) || 0
    hints.height = Number(resizeMatch[2]) || 0
    return hints
  }

  const wMatch = url.match(/[?&](?:w|width)=([0-9]{2,4})/i)
  const hMatch = url.match(/[?&](?:h|height)=([0-9]{2,4})/i)
  hints.width = wMatch ? Number(wMatch[1]) || 0 : 0
  hints.height = hMatch ? Number(hMatch[1]) || 0 : 0
  return hints
}

function isLikelyLogoOrIcon(url, alt = '') {
  const haystack = `${url} ${alt}`.toLowerCase()
  return /(logo|icon|avatar|sprite|favicon|badge|brand)/.test(haystack)
}

function scoreImageCandidate(candidate, titleIndex) {
  const { width, height } = parseImageSizeHints(candidate.url)
  const isBig = width >= 500 || height >= 320
  const isVeryCloseToTitle = candidate.index >= titleIndex && candidate.index <= titleIndex + 12000
  const isCloseToTitle = candidate.index >= titleIndex && candidate.index <= titleIndex + 24000

  let score = 0
  if (isBig) score += 50
  if (isVeryCloseToTitle) score += 40
  else if (isCloseToTitle) score += 20
  if (/\b(recipe|food|meal|dish|production|images?)\b/i.test(candidate.url)) score += 10
  if (isLikelyLogoOrIcon(candidate.url, candidate.alt)) score -= 200

  return score
}

function extractFallbackImageNearTitle(html, logger) {
  const normalized = (html || '').replace(/\r\n/g, '\n')
  if (!normalized) return null

  const candidates = []

  for (const match of normalized.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi)) {
    candidates.push({ alt: match[1] || '', url: match[2], index: match.index || 0 })
  }

  for (const match of normalized.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi)) {
    const tag = match[0] || ''
    const altMatch = tag.match(/alt=["']([^"']*)["']/i)
    candidates.push({ alt: altMatch?.[1] || '', url: match[1], index: match.index || 0 })
  }

  if (candidates.length === 0) {
    logger?.log('Fallback image scan: no image candidates found in fetched content')
    return null
  }

  const headingMatch = normalized.match(/(^|\n)#\s+.+/)
  const titleIndex = headingMatch?.index || 0

  const ranked = candidates
    .filter(c => c.url && /^https?:\/\//i.test(c.url))
    .map(c => ({ ...c, score: scoreImageCandidate(c, titleIndex) }))
    .sort((a, b) => b.score - a.score)

  const winner = ranked[0]
  if (!winner || winner.score < 0) {
    logger?.log('Fallback image scan: only low-quality candidates (likely logos/icons)')
    return null
  }

  logger?.log(
    `Fallback image selected: ${winner.url.substring(0, 160)} (score=${winner.score})`
  )
  return winner.url
}

function withTimeout(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { controller, clear: () => clearTimeout(timer) }
}

function normalizeJinaOutput(text) {
  // r.jina.ai returns readable text/markdown. Keep it as-is for extraction.
  return text
}

function getFetchAttempts(url) {
  return [
    {
      name: 'r.jina.ai reader',
      target: `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`,
      transform: normalizeJinaOutput,
    },
    {
      name: 'allorigins raw',
      target: CORS_PROXY + encodeURIComponent(url),
      transform: text => text,
    },
    {
      name: 'corsproxy.io',
      target: `https://corsproxy.io/?${encodeURIComponent(url)}`,
      transform: text => text,
    },
  ]
}

function compressTextForPrompt(text, logger) {
  // Preserve line structure to keep ingredient and method lists parseable.
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lower = normalized.toLowerCase()
  const hasIngredients = lower.includes('ingredients')
  const hasIngridientsTypo = lower.includes('ingridients')
  const hasMethod = lower.includes('method') || lower.includes('instructions')

  logger?.log(
    `Content signals: ingredients=${hasIngredients}, ingridients=${hasIngridientsTypo}, method=${hasMethod}`
  )

  const ingredientHeader = /(^|\n)#{1,6}\s*ingredients\b/i
  const methodHeader = /(^|\n)#{1,6}\s*(method|instructions?)\b/i

  const ingMatch = ingredientHeader.exec(normalized)
  const methodMatch = methodHeader.exec(normalized)

  // Keep useful top-of-page context (title/subtitle), then prioritize recipe sections.
  const head = normalized.slice(0, 2500)

  const sections = []
  if (ingMatch) {
    const start = Math.max(0, ingMatch.index - 500)
    const end = Math.min(normalized.length, ingMatch.index + 5000)
    sections.push(normalized.slice(start, end))
  }

  if (methodMatch) {
    const start = Math.max(0, methodMatch.index - 500)
    const end = Math.min(normalized.length, methodMatch.index + 5000)
    sections.push(normalized.slice(start, end))
  }

  let combined = [head, ...sections].filter(Boolean).join('\n\n---\n\n')

  if (combined.length < 4000) {
    // Fallback if section headers were not found in this source format.
    combined = normalized.slice(0, MAX_MODEL_INPUT_CHARS)
  }

  const finalText = combined.slice(0, MAX_MODEL_INPUT_CHARS)
  logger?.log(`Prepared model input length: ${finalText.length} chars`)
  return finalText
}

function stripCodeFences(text) {
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()
  }
  return trimmed
}

function extractFirstJsonObject(text) {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null
  }
  return text.slice(firstBrace, lastBrace + 1)
}

function parseModelJson(content, logger) {
  const candidates = []
  const stripped = stripCodeFences(content)
  candidates.push({ label: 'stripped-content', value: stripped })

  const extracted = extractFirstJsonObject(stripped)
  if (extracted && extracted !== stripped) {
    candidates.push({ label: 'extracted-object', value: extracted })
  }

  let lastParseError = null
  for (const candidate of candidates) {
    try {
      logger?.log(`Trying JSON parse strategy: ${candidate.label}`)
      return JSON.parse(candidate.value)
    } catch (err) {
      lastParseError = err
      logger?.log(`Parse strategy failed (${candidate.label}): ${err.message}`)
    }
  }

  throw lastParseError || new Error('Unable to parse JSON')
}

function normalizeRecipe(recipe, logger) {
  if (!Array.isArray(recipe.ingredients)) return recipe

  const knownUnits = new Set(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', ''])
  recipe.ingredients = recipe.ingredients.map((ing, i) => {
    if (!ing || typeof ing !== 'object') return ing

    const next = { ...ing }
    next.unit = typeof next.unit === 'string' ? next.unit.trim() : ''

    // If model put ingredient name into unit (e.g. unit: 'scallions'), recover it.
    if ((!next.name || String(next.name).trim() === '') && next.unit && !knownUnits.has(next.unit.toLowerCase())) {
      next.name = next.unit
      next.unit = ''
      logger?.log(`Normalized ingredient ${i}: moved unknown unit to name`)
    }

    return next
  })

  return recipe
}

async function getCandidateModels(apiKey, logger) {
  try {
    logger?.log('Fetching available Gemini models for this API key...')
    const response = await fetch(`${GEMINI_LIST_MODELS_URL}?key=${apiKey}`)
    logger?.log(`ListModels response status: ${response.status}`)

    if (!response.ok) {
      logger?.log('ListModels failed, using fallback model list')
      return GEMINI_MODELS
    }

    const data = await response.json()
    const models = data.models || []

    const discovered = models
      .filter(model => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map(model => model.name?.replace('models/', ''))
      .filter(Boolean)
      .filter(name => name.includes('flash'))

    if (discovered.length === 0) {
      logger?.log('No flash models discovered from ListModels, using fallback list')
      return GEMINI_MODELS
    }

    // Prefer known stable ordering, then append other discovered flash models.
    const preferred = GEMINI_MODELS.filter(m => discovered.includes(m))
    const extras = discovered.filter(m => !preferred.includes(m))
    const merged = [...preferred, ...extras]

    logger?.log(`Discovered candidate models: ${merged.join(', ')}`)
    return merged
  } catch (err) {
    logger?.log(`ListModels request failed: ${err.message}`)
    logger?.log('Using fallback model list')
    return GEMINI_MODELS
  }
}

/**
 * Fetch HTML from URL via CORS proxy
 */
export async function fetchHTML(url, logger) {
  const attempts = getFetchAttempts(url)
  const errors = []

  logger?.log(`Fetching URL with fallback strategy`)

  for (const attempt of attempts) {
    const timeout = withTimeout(FETCH_TIMEOUT_MS)
    try {
      logger?.log(`Trying source: ${attempt.name}`)
      logger?.log(`Fetch URL: ${attempt.target.substring(0, 140)}...`)

      const response = await fetch(attempt.target, {
        method: 'GET',
        signal: timeout.controller.signal,
      })

      logger?.log(`HTTP Response Status (${attempt.name}): ${response.status}`)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const raw = await response.text()
      const html = attempt.transform(raw)

      if (!html || html.trim().length < 200) {
        throw new Error('Fetched content is too short or empty')
      }

      logger?.log(`✅ Fetch succeeded via ${attempt.name} (${html.length} chars)`)
      logger?.log(`HTML/Text Preview (first 500 chars):`, html.substring(0, 500))
      timeout.clear()
      return html
    } catch (err) {
      timeout.clear()
      const message = err?.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : err.message
      errors.push(`${attempt.name}: ${message}`)
      logger?.log(`❌ ${attempt.name} failed: ${message}`)
    }
  }

  const summary = errors.join(' | ')
  logger?.log(`❌ All fetch sources failed`, summary)
  throw new Error(`Failed to fetch URL from all sources: ${summary}`)
}

/**
 * Call Gemini Flash API to extract recipe from HTML
 */
export async function extractRecipeFromHTML(html, sourceUrl, apiKey, logger) {
  try {
    const ogImage = extractOGImage(html)
    logger?.log(`Extracted Open Graph image: ${ogImage || 'not found'}`)
    const fallbackImage = ogImage ? null : extractFallbackImageNearTitle(html, logger)
    const imageHint = ogImage || fallbackImage

    const systemPrompt = `You are a recipe extraction assistant. Extract recipe information from the provided HTML and return ONLY valid JSON (no markdown, no code blocks, just raw JSON).

The JSON must follow exactly this schema:
${JSON.stringify(RECIPE_SCHEMA, null, 2)}

Rules:
- All fields are required except 'image' and 'description'
- Tags should be lowercase, single words or short phrases
- Amounts can be decimal numbers
- Units must be one of: g, kg, ml, l, tsp, tbsp, cup, oz, lb, or empty string
- Times should be in minutes (integers)
- If og:image was found in metadata, use it for the image field
${imageHint ? `- Preferred image URL for this page is: ${imageHint}` : ''}
- Return ONLY the JSON object, nothing else
- Do not wrap output in markdown or code fences`

    const compactInput = compressTextForPrompt(html, logger)
    const userPrompt = `Extract the recipe from this HTML/text snapshot:\n\n${compactInput}`

    const candidateModels = await getCandidateModels(apiKey, logger)

    logger?.log(`Making Gemini API request with model fallback...`)
    logger?.log(`Candidate models: ${candidateModels.join(', ')}`)
    logger?.log(`Prompt length: ${userPrompt.length} characters`)

    let data = null
    let lastError = null

    for (const model of candidateModels) {
      const endpoint = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`
      logger?.log(`Trying model: ${model}`)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: userPrompt }],
              role: 'user',
            },
          ],
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      })

      logger?.log(`Gemini Response Status (${model}): ${response.status}`)

      if (response.ok) {
        data = await response.json()
        logger?.log(`✅ Model succeeded: ${model}`)
        break
      }

      const error = await response.json().catch(() => ({}))
      const message = error?.error?.message || `HTTP ${response.status}`
      lastError = message
      logger?.log(`❌ Model failed (${model}): ${message}`)

      // Stop early for key/auth issues that won't be fixed by switching models.
      if (response.status === 401 || response.status === 403) {
        throw new Error(message)
      }

      // Continue on 404/429/5xx and try the next model.
    }

    if (!data) {
      throw new Error(lastError || 'All Gemini models failed')
    }

    logger?.log(`✅ Gemini API returned successfully`)

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    logger?.log(`Response content length: ${content?.length || 0} characters`)

    if (!content) {
      logger?.log(`❌ No text content in Gemini response`)
      logger?.log(`Full response structure:`, data)
      throw new Error('No response from Gemini')
    }

    logger?.log(`Raw Gemini response (first 1000 chars):`, content.substring(0, 1000))

    // Parse JSON
    let recipe
    try {
      logger?.log(`Attempting to parse JSON...`)
      recipe = parseModelJson(content, logger)
      logger?.log(`✅ JSON parsed successfully`)
      logger?.log(`Recipe object keys:`, Object.keys(recipe))
    } catch (parseErr) {
      logger?.log(`❌ JSON Parse Error: ${parseErr.message}`)
      logger?.log(`Content that failed to parse:`, content)
      throw new Error('Invalid JSON from Gemini')
    }

    recipe = normalizeRecipe(recipe, logger)

    // Add source URL
    recipe.source = sourceUrl
    if (!recipe.image && imageHint) {
      recipe.image = imageHint
      logger?.log(`Using selected page image for recipe image`)
    }

    logger?.log(`✅ Recipe extraction complete:`, {
      title: recipe.title,
      ingredients: recipe.ingredients?.length,
      steps: recipe.steps?.length,
      image: !!recipe.image,
    })

    return recipe
  } catch (err) {
    logger?.log(`❌ Final Error: ${err.message}`)
    throw new Error(err.message)
  }
}

/**
 * Validate recipe against schema
 */
export function validateRecipe(recipe, logger) {
  try {
    logger?.log(`Starting recipe validation...`)

    if (!recipe.title || typeof recipe.title !== 'string') {
      logger?.log(`❌ Validation failed: Missing or invalid title`)
      throw new Error('Missing or invalid title')
    }

    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      logger?.log(`❌ Validation failed: Missing or invalid ingredients`)
      throw new Error('Missing or invalid ingredients')
    }

    if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
      logger?.log(`❌ Validation failed: Missing or invalid steps`)
      throw new Error('Missing or invalid steps')
    }

    if (typeof recipe.servings !== 'number' || recipe.servings < 1) {
      logger?.log(`❌ Validation failed: Invalid servings`)
      throw new Error('Invalid servings')
    }

    // Validate ingredients
    recipe.ingredients.forEach((ing, i) => {
      if (!ing?.name || typeof ing.name !== 'string') {
        logger?.log(`❌ Validation failed: Ingredient ${i} missing name`)
        throw new Error(`Ingredient ${i}: missing or invalid name`)
      }
      if (ing.amount !== undefined && ing.amount !== null) {
        const amountType = typeof ing.amount
        if (amountType !== 'string' && amountType !== 'number') {
          logger?.log(`❌ Validation failed: Ingredient ${i} amount must be string or number`)
          throw new Error(`Ingredient ${i}: amount must be string or number`)
        }
      }
    })

    logger?.log(`✅ All validations passed`)
    return true
  } catch (err) {
    logger?.log(`❌ Validation error: ${err.message}`)
    throw err
  }
}
