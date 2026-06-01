import { HashRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import AuthGate from './components/AuthGate'
import RecipeList from './pages/RecipeList'
import RecipeDetail from './pages/RecipeDetail'
import RecipeForm from './pages/RecipeForm'
import Planner from './pages/Planner'
import ShoppingList from './pages/ShoppingList'

export default function App() {
  return (
    <HashRouter>
      <Nav />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/shopping" element={<ShoppingList />} />
          <Route path="/planner" element={<AuthGate><Planner /></AuthGate>} />
          <Route path="/add" element={<AuthGate><RecipeForm /></AuthGate>} />
          <Route path="/edit/:id" element={<AuthGate><RecipeForm /></AuthGate>} />
        </Routes>
      </main>
    </HashRouter>
  )
}