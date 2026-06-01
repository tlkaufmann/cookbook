import { Link, useLocation } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Recipes' },
  { to: '/planner', label: 'Planner' },
  { to: '/shopping', label: 'Shopping' },
]

export default function Nav() {
  const { pathname } = useLocation()

  return (
    <nav className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="font-semibold text-gray-900 text-lg tracking-tight">
          🍳 Cookbook
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                pathname === l.to
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/add"
            className="ml-2 px-3 py-1.5 bg-gray-900 text-white rounded text-sm
                       font-medium hover:bg-gray-700 transition-colors"
          >
            + Add
          </Link>
        </div>
      </div>
    </nav>
  )
}