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
      const trimmed = cookie.trim()
      // Split on the FIRST '=' only — a cookie value may itself contain '='
      // (base64 padding, JWTs, other vendors' encoded values). `split('=')`
      // would truncate the value at the first '='.
      const eq = trimmed.indexOf('=')
      if (eq > 0) {
        const name = trimmed.slice(0, eq)
        const value = trimmed.slice(eq + 1)
        if (value) {
          cookies[name] = decodeURIComponent(value)
        }
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
 * Get dashboard browser-capture test ID from URL query parameter (?rctest=xxx)
 */
export function getSessionCaptureTestIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  return params.get('rctest')
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
 * Get the appropriate domain for setting cookies — picks a value that lets
 * the cookie cross subdomains. The session must survive the navigation from
 * the merchant's marketing site (e.g. `acme.com`) to their app subdomain
 * (e.g. `app.acme.com`) at signup time, otherwise attribution dies on the
 * domain hop.
 *
 * Behavior :
 *   - localhost / raw IP                       → ''         (host-only, dev mode)
 *   - apex 2-part domain (e.g. acme.com)       → '.acme.com'  (shared with subdomains)
 *   - subdomain (e.g. www.acme.com / app.acme.com) → '.acme.com' (parent)
 *
 * ccTLD handling : for hosts on a multi-level effective TLD (e.g. `.co.uk`,
 * `.com.br`), the parent two parts (`.co.uk`) are a public suffix the browser
 * rejects. We carry a small set of the common 2-level suffixes and fall back
 * to the registrable domain (3 parts, `.acme.co.uk`) for those — covering the
 * large majority of affected merchants without shipping the full ~100KB Public
 * Suffix List. A merchant on an uncommon multi-level suffix not in the set
 * still degrades gracefully to URL-param session reuse.
 */

// Common 2-level public suffixes (NOT exhaustive — see PSL). When the parent
// two parts of a hostname are one of these, the registrable domain needs a
// third part.
const TWO_LEVEL_PUBLIC_SUFFIXES = new Set<string>([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'co.za', 'org.za', 'net.za', 'gov.za',
  'com.mx', 'com.ar', 'com.sg', 'com.tr', 'com.hk', 'com.tw', 'co.in', 'co.kr',
])

export function getCookieDomain(hostname?: string): string {
  const host = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  if (!host) return ''

  // Don't set domain for localhost or IP addresses
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return ''
  }

  const parts = host.split('.')
  // Apex (acme.com): set `.acme.com` so app.acme.com can read the cookie
  // after the user navigates from the marketing site to the platform.
  if (parts.length === 2) {
    return `.${host}`
  }
  if (parts.length > 2) {
    const lastTwo = parts.slice(-2).join('.')
    // On a 2-level public suffix (acme.co.uk), the registrable domain is the
    // last THREE parts; `.co.uk` alone would be rejected by the browser.
    if (TWO_LEVEL_PUBLIC_SUFFIXES.has(lastTwo) && parts.length >= 3) {
      return `.${parts.slice(-3).join('.')}`
    }
    // Subdomain (www.acme.com, app.acme.com): set the parent two parts.
    return `.${lastTwo}`
  }
  return ''
}

/**
 * Try to set session cookie with fallback handling
 */
let hasWarnedInsecureCookie = false

export function trySetSessionCookie(sessionId: string): { success: boolean; method: 'cookie' | 'none'; error?: string } {
  if (!areCookiesSupported()) {
    return { success: false, method: 'none', error: 'Cookies not supported' }
  }

  // Never write the session cookie without `Secure` on a real http origin — it
  // would travel in cleartext and could be read/forged on the network (the
  // session id gates commission attribution). Fall back to localStorage
  // (same-origin, not network-exposed). localhost/IP over http stays allowed
  // for local development.
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'http:' &&
    window.location.hostname !== 'localhost' &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname)
  ) {
    if (!hasWarnedInsecureCookie && typeof console !== 'undefined') {
      hasWarnedInsecureCookie = true
      console.warn(
        '[RefCampaign] Serve your site over HTTPS — the attribution session cookie is skipped on insecure http to avoid sending it in cleartext.'
      )
    }
    return { success: false, method: 'none', error: 'Insecure context (http)' }
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
