import { useState } from 'react'
import { fetchHTML, extractRecipeFromHTML, validateRecipe, Logger } from '../lib/gemini'
import { getRecipes, saveRecipes } from '../lib/github'

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
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState([])
  const [selectedLog, setSelectedLog] = useState(null)

  const urls = urlsInput
    .split('\n')
    .map(url => url.trim())
    .filter(url => url && /^https?:\/\//.test(url))

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
        const recipe = await extractRecipeFromHTML(html, url, apiKey, logger)

        logger.log(`Starting validation`)
        validateRecipe(recipe, logger)

        logger.log(`✅ SUCCESS: Recipe imported successfully`)
        setResults(prev =>
          prev.map(r =>
            r.url === url ? { ...r, status: 'success', recipe } : r
          )
        )
      } catch (err) {
        const error = err.message || 'Unknown error'
        logger.log(`❌ FAILED: ${error}`)
        setResults(prev =>
          prev.map(r =>
            r.url === url ? { ...r, status: 'error', error } : r
          )
        )
      }
    }

    setIsProcessing(false)
  }

  async function handleAddRecipes() {
    const recipesToAdd = results
      .filter(r => r.status === 'success' && r.recipe)
      .map(r => r.recipe)

    if (recipesToAdd.length === 0) {
      alert('No recipes to add')
      return
    }

    try {
      const { data: recipes, sha } = await getRecipes()

      const newRecipes = recipesToAdd.map(recipe => ({
        ...recipe,
        id: Date.now().toString() + Math.random(),
        created_at: new Date().toISOString(),
      }))

      await saveRecipes([...recipes, ...newRecipes], sha)
      onSuccess()
      onClose()
    } catch (err) {
      alert(`Failed to save recipes: ${err.message}`)
    }
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
                    onClick={handleAddRecipes}
                    disabled={isProcessing || results.filter(r => r.status === 'success').length === 0}
                    className="flex-1 bg-[#143109] text-white py-2 rounded text-sm font-medium
                               hover:opacity-90 disabled:opacity-40 transition-colors"
                  >
                    Add {results.filter(r => r.status === 'success').length} Recipe
                    {results.filter(r => r.status === 'success').length !== 1 ? 's' : ''}
                  </button>
                </div>
              </div>
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
