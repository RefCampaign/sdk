/**
 * RefCampaign Browser API
 *
 * Client-side SDK for capturing session IDs and tracking affiliate conversions.
 * Use this in browser environments (React, Vue, vanilla JS).
 */

import type {
  SessionCaptureResult,
  SessionIdSource,
} from './types'
import { validateSessionId } from './utils/validation'
import {
  getSessionIdFromCookie,
  getSessionIdFromUrl,
  trySetSessionCookie,
  areCookiesSupported,
} from './utils/cookie'
import {
  getSessionIdFromStorage,
  saveSessionIdToStorage,
  trySetSessionStorage,
  syncSessionStorage,
  cleanExpiredSessions,
} from './utils/storage'

const DEFAULT_API_BASE = 'https://app.refcampaign.com'

/**
 * SHA-256 hex digest via Web Crypto. Throws if Web Crypto isn't available
 * (very old browsers, non-HTTPS contexts on some browsers). Caller wraps in
 * try/catch.
 */
async function sha256Hex(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class RefCampaignBrowserClass {
  private apiBase: string = DEFAULT_API_BASE

  /**
   * Override the RefCampaign API base URL. Default points to production
   * (`https://app.refcampaign.com`). Used for staging or self-hosted
   * deployments. Trailing slashes are stripped.
   *
   * @example
   * RefCampaignBrowser.configure({ apiBase: 'https://app.test.refcampaign.com' })
   */
  configure(options: { apiBase?: string }): void {
    if (options.apiBase) {
      this.apiBase = options.apiBase.replace(/\/+$/, '')
    }
  }

  /**
   * Attach the customer's identity (email hash) to the current click so the
   * conversion attribution pipeline can fall back from sessionId matching to
   * email-hash matching when cookies/localStorage are gone (Safari ITP,
   * cross-device, mode privé).
   *
   * The email is hashed client-side via Web Crypto SHA-256 — the raw email
   * never leaves the browser. Fire-and-forget: failures are silent so the
   * merchant's flow is never disrupted by tracking.
   *
   * Idempotent: calling multiple times for the same session is safe (the
   * server discards subsequent writes — first-write-wins).
   *
   * @example
   * // Right after login or signup, when you know the user's email:
   * RefCampaignBrowser.identify(currentUser.email)
   */
  async identify(email: string): Promise<void> {
    if (!email || typeof email !== 'string') return

    const sessionId = this.getSessionId()
    if (!sessionId) return // No active click — nothing to attach to.

    let emailHash: string
    try {
      emailHash = await sha256Hex(email.trim().toLowerCase())
    } catch {
      return // Web Crypto unavailable (very old browsers); silently no-op.
    }

    try {
      await fetch(`${this.apiBase}/api/track/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, emailHash }),
        keepalive: true,
      })
    } catch {
      // Network errors are expected on flaky connections — swallow.
    }
  }

  /**
   * Capture session ID from URL, cookie, or localStorage
   *
   * Strategy:
   * 1. URL parameter (?_rcid=xxx or ?rcsid=xxx) - highest priority
   * 2. Cookie (_rc_sid)
   * 3. localStorage (_rc_sid)
   *
   * @returns Session capture result
   *
   * @example
   * const result = RefCampaignBrowser.captureSession()
   * console.log(result.sessionId) // 'abc123...'
   * console.log(result.source) // 'url' | 'cookie' | 'localStorage' | 'none'
   */
  captureSession(): SessionCaptureResult {
    // Clean expired sessions first
    cleanExpiredSessions()

    const result: SessionCaptureResult = {
      sessionId: null,
      source: 'none'
    }

    // Priority 1: Check URL parameter (rcsid or _rcid)
    const urlSessionId = getSessionIdFromUrl()
    if (urlSessionId && validateSessionId(urlSessionId)) {
      result.sessionId = urlSessionId
      result.source = 'url'

      // Try to set cookie first (preferred method)
      trySetSessionCookie(urlSessionId)

      // Always also set localStorage as backup
      trySetSessionStorage(urlSessionId)

      // Clean URL parameter to avoid pollution
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        try {
          const url = new URL(window.location.href)
          const hasRcsid = url.searchParams.has('rcsid')
          const hasRcid = url.searchParams.has('_rcid')

          if (hasRcsid || hasRcid) {
            url.searchParams.delete('rcsid')
            url.searchParams.delete('_rcid')
            window.history.replaceState({}, document.title, url.toString())
          }
        } catch (e) {
          // URL cleaning failed, not critical
        }
      }

      return result
    }

    // Priority 2: Check existing cookie and localStorage, sync them
    const cookieSessionId = getSessionIdFromCookie()
    const storageSessionId = getSessionIdFromStorage()

    const syncedSessionId = syncSessionStorage(cookieSessionId, storageSessionId)

    if (syncedSessionId && validateSessionId(syncedSessionId)) {
      result.sessionId = syncedSessionId

      if (cookieSessionId) {
        result.source = 'cookie'
      } else if (storageSessionId) {
        result.source = 'localStorage'
      }

      return result
    }

    return result
  }

  /**
   * Get current session ID from localStorage
   *
   * @returns Session ID or null if not found
   *
   * @example
   * const sessionId = RefCampaignBrowser.getSessionId()
   * if (sessionId) {
   *   console.log('Active session:', sessionId)
   * }
   */
  getSessionId(): string | null {
    return getSessionIdFromStorage()
  }

  /**
   * Get detailed session information for debugging
   *
   * @returns Comprehensive session debug information
   */
  getSessionInfo(): {
    sessionId: string | null
    cookieSupported: boolean
    localStorageSupported: boolean
    cookieSessionId: string | null
    storageSessionId: string | null
    urlSessionId: string | null
  } {
    return {
      sessionId: this.getSessionId(),
      cookieSupported: areCookiesSupported(),
      localStorageSupported: (() => {
        try {
          return typeof localStorage !== 'undefined'
        } catch {
          return false
        }
      })(),
      cookieSessionId: getSessionIdFromCookie(),
      storageSessionId: getSessionIdFromStorage(),
      urlSessionId: getSessionIdFromUrl()
    }
  }

  /**
   * Clear all stored session data (for testing/debugging)
   *
   * @returns Success status
   */
  clearSession(): boolean {
    let success = true

    // Remove from localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('_rc_sid')
      }
    } catch (e) {
      success = false
    }

    // Remove cookie if supported
    try {
      if (areCookiesSupported()) {
        const domain = this.getCookieDomain()
        let cookieString = '_rc_sid=; max-age=0; SameSite=Lax; path=/'
        if (domain) {
          cookieString += `; domain=${domain}`
        }
        document.cookie = cookieString
      }
    } catch (e) {
      success = false
    }

    return success
  }

  /**
   * Get cookie domain (private method made available for debugging)
   */
  private getCookieDomain(): string {
    if (typeof window === 'undefined') return ''

    const hostname = window.location.hostname

    // Don't set domain for localhost or IP addresses
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return ''
    }

    // For subdomains, try to use parent domain
    const parts = hostname.split('.')
    if (parts.length > 2) {
      return `.${parts.slice(-2).join('.')}`
    }

    return ''
  }
}

// Export singleton instance
export const RefCampaignBrowser = new RefCampaignBrowserClass()
