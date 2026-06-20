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
  getSessionCaptureTestIdFromUrl,
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
import { sendInstallPing } from './install-ping'
import { sendSessionCapturePing } from './session-capture-ping'

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
  private siteToken: string | undefined
  private debug = false

  /** Console logger gated on the `debug` flag. No-op otherwise. */
  private log(...args: unknown[]): void {
    if (this.debug) console.log('[RefCampaign]', ...args)
  }

  /**
   * Configure the SDK.
   *
   * - `apiBase` — override the RefCampaign API base URL. Default points to
   *   production (`https://app.refcampaign.com`). Used for staging or
   *   self-hosted deployments. Trailing slashes are stripped.
   * - `siteToken` — the per-account install token (`rcst_*`) shown on the SDK
   *   setup page. Required for npm installs to verify the install; the platform
   *   resolves the merchant by this token. CDN (`v1.js?s=...`) installs carry
   *   it via the script URL instead and don't need this.
   * - `debug` — when true, logs configuration, session capture, identify, and
   *   install-ping outcomes to the console. Off by default; turn on during
   *   integration to confirm the SDK is wired correctly.
   *
   * @example
   * RefCampaignBrowser.configure({ siteToken: 'rcst_...', debug: true })
   */
  configure(options: { apiBase?: string; siteToken?: string; debug?: boolean }): void {
    if (options.apiBase) {
      this.apiBase = options.apiBase.replace(/\/+$/, '')
    }
    if (options.siteToken) {
      this.siteToken = options.siteToken
    }
    if (options.debug !== undefined) {
      this.debug = options.debug
    }
    this.log('configured', {
      apiBase: this.apiBase,
      siteToken: this.siteToken ? `${this.siteToken.slice(0, 9)}…` : undefined,
    })
    if (typeof window !== 'undefined') {
      sendInstallPing(this.apiBase, this.siteToken, this.debug)
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
    if (!sessionId) {
      this.log('identify skipped — no active session')
      return // No active click — nothing to attach to.
    }

    let emailHash: string
    try {
      emailHash = await sha256Hex(email.trim().toLowerCase())
    } catch {
      return // Web Crypto unavailable (very old browsers); silently no-op.
    }

    // Bound the request so an awaiting caller (the docstring shows identify()
    // called from a login handler) is never frozen by a hung connection —
    // `keepalive` does not impose a timeout. Mirrors the server SDK's abort
    // pattern; on timeout/error we swallow, since identify is best-effort and
    // must never disrupt the merchant's flow.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      await fetch(`${this.apiBase}/api/track/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, emailHash }),
        keepalive: true,
        signal: controller.signal,
      })
      this.log('identify sent for session', sessionId)
    } catch (error) {
      // Network errors / timeout are expected on flaky connections — swallow.
      this.log('identify failed', error)
    } finally {
      clearTimeout(timer)
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
    const result = this.resolveSessionCapture()
    this.log('captureSession', result)
    return result
  }

  /** Core session resolution (URL → cookie → localStorage). */
  private resolveSessionCapture(): SessionCaptureResult {
    // Clean expired sessions first
    cleanExpiredSessions()

    const result: SessionCaptureResult = {
      sessionId: null,
      source: 'none'
    }

    // Priority 1: Check URL parameter (rcsid or _rcid)
    const urlSessionId = getSessionIdFromUrl()
    if (urlSessionId && validateSessionId(urlSessionId)) {
      const captureTestId = getSessionCaptureTestIdFromUrl()
      result.sessionId = urlSessionId
      result.source = 'url'

      // Try to set cookie first (preferred method)
      trySetSessionCookie(urlSessionId)

      // Always also set localStorage as backup
      trySetSessionStorage(urlSessionId)

      if (captureTestId && this.siteToken) {
        sendSessionCapturePing(this.apiBase, {
          siteToken: this.siteToken,
          testId: captureTestId,
          sessionId: urlSessionId,
          source: 'url',
        })
      }

      // Clean URL parameter to avoid pollution
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        try {
          const url = new URL(window.location.href)
          const hasRcsid = url.searchParams.has('rcsid')
          const hasRcid = url.searchParams.has('_rcid')
          const hasRctest = url.searchParams.has('rctest')

          if (hasRcsid || hasRcid || hasRctest) {
            url.searchParams.delete('rcsid')
            url.searchParams.delete('_rcid')
            url.searchParams.delete('rctest')
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

// Mirror guard with the IIFE auto-init: if the CDN snippet has already
// loaded (`window.__refcampaignLoaded === true`), the merchant is mixing
// CDN and npm-browser usage. Both paths share the same cookie and
// localStorage keys, so it works, but they double the network calls and
// confuse debugging. Surface a console warning during dev so the merchant
// can pick one path. Silent in non-browser contexts (SSR, Node server).
if (typeof window !== 'undefined') {
  const w = window as Window & { __refcampaignLoaded?: boolean }
  if (w.__refcampaignLoaded) {
    console.warn(
      '[RefCampaign] SDK loaded via both CDN and npm browser import. ' +
        'Pick one path (browser side) — server-side npm import is unaffected. ' +
        'See https://github.com/RefCampaign/sdk for the install paths.',
    )
  } else {
    // Module-level ping: covers npm consumers who call identify() without
    // configure(). Hardcoded to DEFAULT_API_BASE — this fires before any
    // configure() call (configure() has its own ping site), so the apiBase
    // override would not yet be applied. Idempotent via the install-ping
    // localStorage debounce, so a subsequent configure() call won't
    // double-ping within 24h.
    sendInstallPing(DEFAULT_API_BASE)
  }
}
