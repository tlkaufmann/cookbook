import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ImportModal from './ImportModal'
import DeployBadge from './DeployBadge'

const LINKS = [
  { to: '/', label: 'Recipes' },
  { to: '/planner', label: 'Planner' },
  { to: '/shopping', label: 'Shopping' },
]

export default function Nav() {
  const { pathname } = useLocation()
  const [showImport, setShowImport] = useState(false)

  return (
    <>
      <nav className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-[#143109]/15">
        <div className="max-w-3xl mx-auto gap-2 px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <Link to="/" className="font-semibold text-[#143109] text-lg tracking-tight">
              🍳 Cookbook
            </Link>
            <DeployBadge />
          </div>
          <div className="flex items-center gap-1">
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
            <button
              onClick={() => setShowImport(true)}
              className="ml-2 px-3 py-1.5 bg-white text-[#143109] border border-[#143109]/30 rounded text-sm
                         font-medium hover:bg-[#143109]/5 transition-colors"
            >
              📥 Import
            </button>
            <Link
              to="/add"
              className="px-3 py-1.5 bg-[#143109] text-white rounded text-sm
                         font-medium hover:opacity-90 transition-colors"
            >
              + Add
            </Link>
          </div>
        </div>
      </nav>
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            // Trigger a refresh of recipes if needed
            window.location.reload()
          }}
        />
      )}
    </>
  )
}