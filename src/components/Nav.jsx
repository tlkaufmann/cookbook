import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ImportModal from './ImportModal'
import DeployBadge from './DeployBadge'

const LINKS = [
  { to: '/', label: 'Recipes' },
  { to: '/planner', label: 'Planner' },
  { to: '/shopping', label: 'Shopping' },
]

export default function Nav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [showImport, setShowImport] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [burgerOpen, setBurgerOpen] = useState(false)
  const addRef = useRef(null)

  // Close Add dropdown on outside click
  useEffect(() => {
    if (!addOpen) return
    function handler(e) {
      if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addOpen])

  // Close burger on route change
  useEffect(() => { setBurgerOpen(false) }, [pathname])

  return (
    <>
      <nav className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-[#143109]/15">
        <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/" className="font-semibold text-[#143109] text-lg tracking-tight whitespace-nowrap">
              🍳 Cookbook
            </Link>
            <DeployBadge />
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {LINKS.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  pathname === l.to
                    ? 'bg-[#143109] text-white'
                    : 'text-gray-500 hover:text-[#143109]'
                }`}
              >
                {l.label}
              </Link>
            ))}

            {/* Combined Add dropdown */}
            <div ref={addRef} className="relative ml-2">
              <button
                onClick={() => setAddOpen(o => !o)}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#143109] text-white rounded text-sm
                           font-medium hover:opacity-90 transition-colors whitespace-nowrap"
              >
                + Add
                <svg className={`w-3 h-3 transition-transform ${addOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 8L1 3h10z"/>
                </svg>
              </button>
              {addOpen && (
                <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <button
                    onClick={() => { setAddOpen(false); navigate('/add') }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    ✏️ Manual
                  </button>
                  <button
                    onClick={() => { setAddOpen(false); setShowImport(true) }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    📥 Import
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile burger */}
          <button
            className="md:hidden p-2 text-[#143109] hover:bg-[#143109]/10 rounded transition-colors"
            onClick={() => setBurgerOpen(o => !o)}
            aria-label="Menu"
          >
            {burgerOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            )}
          </button>
        </div>

        {/* Mobile dropdown */}
        {burgerOpen && (
          <div className="md:hidden border-t border-[#143109]/10 bg-white/98 px-4 py-3 space-y-1">
            {LINKS.map(l => (
              <Link
                key={l.to}
                to={l.to}
                className={`block px-3 py-2 rounded text-sm font-medium transition-colors ${
                  pathname === l.to
                    ? 'bg-[#143109] text-white'
                    : 'text-gray-600 hover:bg-[#143109]/5 hover:text-[#143109]'
                }`}
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-1 border-t border-gray-100 space-y-1">
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Add</div>
              <Link
                to="/add"
                className="block px-3 py-2 rounded text-sm font-medium text-gray-600 hover:bg-[#143109]/5 hover:text-[#143109] whitespace-nowrap"
              >
                ✏️ Manual
              </Link>
              <button
                onClick={() => { setBurgerOpen(false); setShowImport(true) }}
                className="w-full text-left px-3 py-2 rounded text-sm font-medium text-gray-600 hover:bg-[#143109]/5 hover:text-[#143109] whitespace-nowrap"
              >
                📥 Import
              </button>
            </div>
          </div>
        )}
      </nav>

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => window.location.reload()}
        />
      )}
    </>
  )
}
