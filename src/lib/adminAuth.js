const ADMIN_UNLOCK_KEY = 'cookbook.admin.unlocked'

function normalizeHash(value) {
  return String(value || '').trim().toLowerCase()
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function getConfiguredAdminPasswordHash() {
  return normalizeHash(import.meta.env.VITE_ADMIN_PASSWORD_HASH)
}

export function hasConfiguredAdminPassword() {
  return Boolean(getConfiguredAdminPasswordHash())
}

export async function hashAdminPassword(password) {
  const encoded = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return bytesToHex(new Uint8Array(digest))
}

export async function verifyAdminPassword(password) {
  const configuredHash = getConfiguredAdminPasswordHash()
  if (!configuredHash) return false
  const candidateHash = await hashAdminPassword(password)
  return candidateHash === configuredHash
}

export function isAdminUnlocked() {
  return localStorage.getItem(ADMIN_UNLOCK_KEY) === '1'
}

export function setAdminUnlocked() {
  localStorage.setItem(ADMIN_UNLOCK_KEY, '1')
}

export function clearAdminUnlocked() {
  localStorage.removeItem(ADMIN_UNLOCK_KEY)
}
