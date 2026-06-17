/**
 * Covers two cookie hardening fixes:
 *  - parseCookies must not truncate a value that contains '=' (M2).
 *  - trySetSessionCookie must not write a non-Secure session cookie on a real
 *    http origin (M4) — it falls back to localStorage instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseCookies, trySetSessionCookie } from '../utils/cookie'

function clearCookies(): void {
  document.cookie.split(';').forEach((c) => {
    const eq = c.indexOf('=')
    const name = (eq > 0 ? c.slice(0, eq) : c).trim()
    if (name) document.cookie = `${name}=; max-age=0; path=/`
  })
}

afterEach(() => {
  clearCookies()
  vi.unstubAllGlobals()
})

describe('parseCookies', () => {
  it('preserves a value containing "=" (e.g. base64 padding / JWT)', () => {
    document.cookie = `other=${encodeURIComponent('a=b=c')}; path=/`
    expect(parseCookies().other).toBe('a=b=c')
  })

  it('reads a normal value', () => {
    document.cookie = 'simple=value123; path=/'
    expect(parseCookies().simple).toBe('value123')
  })
})

describe('trySetSessionCookie — insecure http guard (M4)', () => {
  it('skips the cookie on a real http origin and reports no cookie set', () => {
    vi.stubGlobal('window', {
      ...window,
      location: { protocol: 'http:', hostname: 'shop.example.com', search: '' },
    })

    const result = trySetSessionCookie('sess_insecure')
    expect(result.success).toBe(false)
    expect(result.method).toBe('none')
    expect(document.cookie).not.toContain('sess_insecure')
  })
})
