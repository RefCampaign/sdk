import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RefCampaignBrowser } from '../browser'

describe('RefCampaignBrowser', () => {
  beforeEach(() => {
    // Reset browser state
    if (typeof window !== 'undefined') {
      window.localStorage.clear()
      // Clear cookies
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/')
      })
    }
  })

  describe('captureSession', () => {

    it('should capture session from URL parameter', () => {
      // Mock URL with _rcid parameter
      const originalLocation = window.location
      delete (window as any).location
      window.location = {
        ...originalLocation,
        search: '?_rcid=test-session-id-123',
      } as any

      const result = RefCampaignBrowser.captureSession()
      expect(result.sessionId).toBe('test-session-id-123')
      expect(result.source).toBe('url')

      // Restore
      window.location = originalLocation
    })

    it('should capture session from localStorage', () => {
      // Set session in localStorage
      window.localStorage.setItem('_rc_sid', 'stored-session-id')

      const result = RefCampaignBrowser.captureSession()
      expect(result.sessionId).toBe('stored-session-id')
      expect(result.source).toBe('localStorage')
    })

    it('should return none if no session found', () => {
      const result = RefCampaignBrowser.captureSession()
      expect(result.sessionId).toBeNull()
      expect(result.source).toBe('none')
    })
  })

  describe('getSessionId', () => {
    it('should return session ID from localStorage', () => {
      window.localStorage.setItem('_rc_sid', 'test-session-123')
      expect(RefCampaignBrowser.getSessionId()).toBe('test-session-123')
    })

    it('should return null if no session stored', () => {
      expect(RefCampaignBrowser.getSessionId()).toBeNull()
    })
  })

  describe('identify', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) })
      vi.stubGlobal('fetch', fetchMock)
      // Reset apiBase between tests via the public configure() so we don't
      // leak state across describe blocks.
      RefCampaignBrowser.configure({ apiBase: 'https://app.test.example' })
    })

    it('does nothing when no session is active', async () => {
      await RefCampaignBrowser.identify('user@example.com')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('does nothing when called with an empty email', async () => {
      window.localStorage.setItem('_rc_sid', 'sess_abc')
      await RefCampaignBrowser.identify('')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('POSTs sessionId + SHA-256 hex emailHash when both are available', async () => {
      window.localStorage.setItem('_rc_sid', 'sess_abc')
      await RefCampaignBrowser.identify('user@example.com')

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://app.test.example/api/track/identify')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body)
      expect(body.sessionId).toBe('sess_abc')
      expect(body.emailHash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('hashes the lowercased trimmed email — case and whitespace are normalized', async () => {
      window.localStorage.setItem('_rc_sid', 'sess_abc')
      await RefCampaignBrowser.identify('  User@Example.COM  ')
      const bodyA = JSON.parse(fetchMock.mock.calls[0][1].body)

      fetchMock.mockClear()
      await RefCampaignBrowser.identify('user@example.com')
      const bodyB = JSON.parse(fetchMock.mock.calls[0][1].body)

      expect(bodyA.emailHash).toBe(bodyB.emailHash)
    })

    it('swallows network errors silently — never throws', async () => {
      window.localStorage.setItem('_rc_sid', 'sess_abc')
      fetchMock.mockRejectedValue(new Error('network down'))
      await expect(RefCampaignBrowser.identify('user@example.com')).resolves.toBeUndefined()
    })

    it('uses keepalive so the request survives navigation immediately after the call', async () => {
      window.localStorage.setItem('_rc_sid', 'sess_abc')
      await RefCampaignBrowser.identify('user@example.com')
      expect(fetchMock.mock.calls[0][1].keepalive).toBe(true)
    })
  })

  describe('configure', () => {
    it('strips trailing slashes from the apiBase', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      RefCampaignBrowser.configure({ apiBase: 'https://app.staging.example///' })
      window.localStorage.setItem('_rc_sid', 'sess_x')

      await RefCampaignBrowser.identify('a@b.com')
      expect(fetchMock.mock.calls[0][0]).toBe('https://app.staging.example/api/track/identify')
    })
  })
})
