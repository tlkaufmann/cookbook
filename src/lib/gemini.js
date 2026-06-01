const CORS_PROXY = 'https://api.allorigins.win/raw?url='
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_LIST_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-8b-latest',
  'gemini-1.5-flash-latest',
]
const FETCH_TIMEOUT_MS = 20000
const MAX_MODEL_INPUT_CHARS = 5000

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

function compressTextForPrompt(text) {
  // Reduce prompt size without losing key semantics from fetched content.
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_MODEL_INPUT_CHARS)
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
${ogImage ? `- The og:image URL is: ${ogImage}` : ''}
- Return ONLY the JSON object, nothing else
- Do not wrap output in markdown or code fences`

    const compactInput = compressTextForPrompt(html)
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
    if (!recipe.image && ogImage) {
      recipe.image = ogImage
      logger?.log(`Using og:image as recipe image`)
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
