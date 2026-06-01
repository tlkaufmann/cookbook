const STORAGE_KEYS = {
  mealPlan: 'cookbook.meal-plan.v1',
  shoppingList: 'cookbook.shopping-list.v1',
}

function readJson(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallbackValue
  } catch {
    return fallbackValue
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function loadMealPlan() {
  return readJson(STORAGE_KEYS.mealPlan, {})
}

export function saveMealPlan(plan) {
  writeJson(STORAGE_KEYS.mealPlan, plan)
}

export function loadShoppingList() {
  return readJson(STORAGE_KEYS.shoppingList, [])
}

export function saveShoppingList(items) {
  writeJson(STORAGE_KEYS.shoppingList, items)
}
