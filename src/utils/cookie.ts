/**
 * Cookie utilities for RefCampaign SDK
 */

const COOKIE_NAME = '_rc_sid'
const COOKIE_DURATION_DAYS = 90

/**
 * Parse cookies from document.cookie string
 */
export function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') return {}

  return document.cookie.split(';').reduce(
    (cookies, cookie) => {
      const [name, value] = cookie.trim().split('=')
      if (name && value) {
        cookies[name] = decodeURIComponent(value)
      }
      return cookies
    },
    {} as Record<string, string>
  )
}

/**
 * Get RefCampaign session ID from cookie
 */
export function getSessionIdFromCookie(): string | null {
  const cookies = parseCookies()
  return cookies[COOKIE_NAME] || null
}

/**
 * Get session ID from URL query parameter (?_rcid=xxx or ?rcsid=xxx)
 */
export function getSessionIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  // Check both _rcid and rcsid parameters for backward compatibility
  return params.get('_rcid') || params.get('rcsid')
}

/**
 * Check if cookies are supported in the current environment
 */
export function areCookiesSupported(): boolean {
  if (typeof document === 'undefined') return false

  try {
    const testCookie = '__rc_cookie_test__'
    document.cookie = `${testCookie}=test; max-age=1; SameSite=Lax`
    const supported = document.cookie.indexOf(testCookie) !== -1
    // Clean up test cookie
    document.cookie = `${testCookie}=; max-age=0; SameSite=Lax`
    return supported
  } catch (e) {
    return false
  }
}

/**
 * Get the appropriate domain for setting cookies
 * Automatically detects if we should use a parent domain
 */
function getCookieDomain(): string {
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

/**
 * Try to set session cookie with fallback handling
 */
export function trySetSessionCookie(sessionId: string): { success: boolean; method: 'cookie' | 'none'; error?: string } {
  if (!areCookiesSupported()) {
    return { success: false, method: 'none', error: 'Cookies not supported' }
  }

  try {
    const domain = getCookieDomain()
    const maxAge = COOKIE_DURATION_DAYS * 24 * 60 * 60 // 90 days in seconds

    // Build cookie string
    let cookieString = `${COOKIE_NAME}=${encodeURIComponent(sessionId)}; max-age=${maxAge}; SameSite=Lax; path=/`

    // Add Secure flag for HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      cookieString += '; Secure'
    }

    // Add domain if detected
    if (domain) {
      cookieString += `; domain=${domain}`
    }

    document.cookie = cookieString

    // Verify cookie was set
    const setCookie = getSessionIdFromCookie()
    if (setCookie === sessionId) {
      return { success: true, method: 'cookie' }
    } else {
      return { success: false, method: 'none', error: 'Cookie not set correctly' }
    }
  } catch (e) {
    return { success: false, method: 'none', error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

/**
 * Remove session cookie
 */
export function removeSessionCookie(): boolean {
  if (!areCookiesSupported()) return false

  try {
    const domain = getCookieDomain()

    // Remove cookie by setting max-age to 0
    let cookieString = `${COOKIE_NAME}=; max-age=0; SameSite=Lax; path=/`

    if (domain) {
      cookieString += `; domain=${domain}`
    }

    document.cookie = cookieString
    return true
  } catch (e) {
    return false
  }
}
