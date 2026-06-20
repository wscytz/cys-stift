/**
 * Device ID (v0.22.6-refactor restore).
 * Generates and persists a stable deviceId per browser profile.
 *
 * SSR safe: returns 'ssr' on the server, persists to localStorage
 * on the client via the scheme `cys-stift.device-id.v1`.
 */
const STORAGE_KEY = 'cys-stift.device-id.v1'

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments (spec compliant but slower)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY)
    if (existing) return existing
    const id = generateUUID()
    window.localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    // localStorage unavailable (private browsing edge case), session-scoped UUID
    return generateUUID()
  }
}
