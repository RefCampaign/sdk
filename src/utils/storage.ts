/**
 * localStorage utilities for RefCampaign SDK
 */

const STORAGE_KEY = '_rc_sid'
const STORAGE_DURATION_DAYS = 90

interface StoredSessionData {
  sessionId: string
  timestamp: number
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false

  try {
    const test = '__rc_storage_test__'
    window.localStorage.setItem(test, test)
    window.localStorage.removeItem(test)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Check if stored session data is expired
 */
function isSessionExpired(timestamp: number): boolean {
  const maxAge = STORAGE_DURATION_DAYS * 24 * 60 * 60 * 1000 // 90 days in milliseconds
  return Date.now() - timestamp > maxAge
}

/**
 * Clean expired sessions from localStorage
 */
export function cleanExpiredSessions(): void {
  if (!isLocalStorageAvailable()) return

  let cleaned = false

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    // Try to parse as new format first
    try {
      const data: StoredSessionData = JSON.parse(stored)
      if (data.timestamp && isSessionExpired(data.timestamp)) {
        window.localStorage.removeItem(STORAGE_KEY)
        cleaned = true
      }
    } catch (parseError) {
      // If parsing fails, it might be old format (just a string)
      // Keep it for now, but it will be upgraded on next save
    }

  } catch (e) {
    console.error('[RefCampaign] Failed to clean expired sessions:', e)
  }
}

/**
 * Get session ID from localStorage with expiration check
 */
export function getSessionIdFromStorage(): string | null {
  if (!isLocalStorageAvailable()) return null

  try {
    // Clean expired sessions first
    cleanExpiredSessions()

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    // Try to parse as new format first
    try {
      const data: StoredSessionData = JSON.parse(stored)

      // Check if expired
      if (data.timestamp && isSessionExpired(data.timestamp)) {
        window.localStorage.removeItem(STORAGE_KEY)
        return null
      }

      return data.sessionId
    } catch (parseError) {
      // Fallback for old format (just a string sessionId)
      // This provides backward compatibility
      if (typeof stored === 'string' && stored.length > 0) {
        // Upgrade to new format
        saveSessionIdToStorage(stored)
        return stored
      }
      return null
    }
  } catch (e) {
    console.error('[RefCampaign] Failed to read from localStorage:', e)
    return null
  }
}

/**
 * Save session ID to localStorage with timestamp
 */
export function saveSessionIdToStorage(sessionId: string): boolean {
  if (!isLocalStorageAvailable()) return false

  try {
    const data: StoredSessionData = {
      sessionId,
      timestamp: Date.now()
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (e) {
    console.error('[RefCampaign] Failed to write to localStorage:', e)
    return false
  }
}

/**
 * Try to save session to localStorage with error handling
 */
export function trySetSessionStorage(sessionId: string): { success: boolean; method: 'localStorage' | 'none'; error?: string } {
  if (!isLocalStorageAvailable()) {
    return { success: false, method: 'none', error: 'localStorage not available' }
  }

  if (saveSessionIdToStorage(sessionId)) {
    return { success: true, method: 'localStorage' }
  } else {
    return { success: false, method: 'none', error: 'Failed to save to localStorage' }
  }
}

/**
 * Synchronize session between cookie and localStorage
 * Prioritizes cookie if both exist and are different
 */
export function syncSessionStorage(cookieSessionId: string | null, storageSessionId: string | null): string | null {
  // If cookie exists, ensure localStorage matches
  if (cookieSessionId) {
    if (!storageSessionId || storageSessionId !== cookieSessionId) {
      saveSessionIdToStorage(cookieSessionId)
    }
    return cookieSessionId
  }

  // If only localStorage exists, keep it
  if (storageSessionId) {
    return storageSessionId
  }

  return null
}

/**
 * Remove session ID from localStorage
 */
export function removeSessionIdFromStorage(): boolean {
  if (!isLocalStorageAvailable()) return false

  try {
    window.localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (e) {
    console.error('[RefCampaign] Failed to remove from localStorage:', e)
    return false
  }
}
