/**
 * Pins the cookie domain selection — load-bearing for cross-domain
 * attribution. The merchant's session must survive the navigation from
 * their marketing site (apex) to their app subdomain at signup time.
 *
 * Pre-1.4.0 behavior (buggy on apex domains) :
 *   - apex 2-part `acme.com`     → '' (host-only) → broke cross-domain
 *   - subdomain `www.acme.com`   → '.acme.com'
 *
 * 1.4.0 behavior (fixed) :
 *   - apex 2-part `acme.com`     → '.acme.com' (shared with subdomains)
 *   - subdomain `www.acme.com`   → '.acme.com' (unchanged)
 *
 * Without this fix, a visitor landing on `refcampaign.com/?_rcid=XXX` and
 * then navigating to `app.refcampaign.com/auth/signup` would lose the
 * session — `_rc_sid` was scoped host-only on the apex.
 */
import { describe, expect, it } from 'vitest'
import { getCookieDomain } from '../utils/cookie'

describe('getCookieDomain', () => {
  describe('apex domains (2 parts)', () => {
    it('sets .acme.com for acme.com so subdomains can read', () => {
      expect(getCookieDomain('acme.com')).toBe('.acme.com')
    })

    it('sets .refcampaign.com for refcampaign.com (our own marketing site)', () => {
      expect(getCookieDomain('refcampaign.com')).toBe('.refcampaign.com')
    })
  })

  describe('subdomains (3+ parts)', () => {
    it('returns .acme.com for www.acme.com', () => {
      expect(getCookieDomain('www.acme.com')).toBe('.acme.com')
    })

    it('returns .refcampaign.com for app.refcampaign.com (platform host)', () => {
      expect(getCookieDomain('app.refcampaign.com')).toBe('.refcampaign.com')
    })

    it('returns .refcampaign.com for sdk.refcampaign.com (CDN host)', () => {
      expect(getCookieDomain('sdk.refcampaign.com')).toBe('.refcampaign.com')
    })

    it('returns .refcampaign.com for any merchant subdomain', () => {
      expect(getCookieDomain('acme.refcampaign.com')).toBe('.refcampaign.com')
    })
  })

  describe('non-attributable hosts', () => {
    it('returns empty string for localhost (dev mode)', () => {
      expect(getCookieDomain('localhost')).toBe('')
    })

    it('returns empty string for raw IPv4', () => {
      expect(getCookieDomain('192.168.1.42')).toBe('')
      expect(getCookieDomain('127.0.0.1')).toBe('')
    })

    it('returns empty string when hostname argument is empty', () => {
      // Defensive default — explicit empty input shouldn't crash.
      expect(getCookieDomain('')).toBe('')
    })
  })
})
