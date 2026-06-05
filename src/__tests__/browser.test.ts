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
    window.history.pushState({}, '', '/')
    vi.unstubAllGlobals()
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

    it('pings verification when URL contains rcsid + rctest and the SDK has a siteToken', async () => {
      window.localStorage.setItem(
        '_rc_installed_at:https://app.refcampaign.com',
        String(Date.now()),
      )
      window.localStorage.setItem(
        '_rc_installed_at:https://app.test.example:rcst_abc',
        String(Date.now()),
      )
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      vi.resetModules()
      const { RefCampaignBrowser: FreshRefCampaignBrowser } = await import('../browser')
      FreshRefCampaignBrowser.configure({
        apiBase: 'https://app.test.example',
        siteToken: 'rcst_abc',
      })

      window.history.pushState(
        {},
        '',
        '/checkout?rcsid=sdkcap_sess_123456789&rctest=sdkcap_test_123456789',
      )

      const result = FreshRefCampaignBrowser.captureSession()

      expect(result.sessionId).toBe('sdkcap_sess_123456789')
      expect(result.source).toBe('url')
      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.test.example/api/sdk/session-captured',
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          mode: 'cors',
          credentials: 'omit',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            siteToken: 'rcst_abc',
            testId: 'sdkcap_test_123456789',
            sessionId: 'sdkcap_sess_123456789',
            source: 'url',
          }),
        }),
      )
      expect(window.location.search).toBe('')
    })

    it('does not ping verification when rctest is absent', async () => {
      window.localStorage.setItem(
        '_rc_installed_at:https://app.refcampaign.com',
        String(Date.now()),
      )
      window.localStorage.setItem(
        '_rc_installed_at:https://app.test.example:rcst_abc',
        String(Date.now()),
      )
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      vi.resetModules()
      const { RefCampaignBrowser: FreshRefCampaignBrowser } = await import('../browser')
      FreshRefCampaignBrowser.configure({
        apiBase: 'https://app.test.example',
        siteToken: 'rcst_abc',
      })

      window.history.pushState({}, '', '/checkout?rcsid=sdkcap_sess_123456789')

      FreshRefCampaignBrowser.captureSession()

      expect(fetchMock).not.toHaveBeenCalledWith(
        'https://app.test.example/api/sdk/session-captured',
        expect.anything(),
      )
    })

    it('does not ping verification when the SDK has no siteToken', async () => {
      window.localStorage.setItem(
        '_rc_installed_at:https://app.refcampaign.com',
        String(Date.now()),
      )
      window.localStorage.setItem(
        '_rc_installed_at:https://app.test.example',
        String(Date.now()),
      )
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)
      vi.resetModules()
      const { RefCampaignBrowser: FreshRefCampaignBrowser } = await import('../browser')
      FreshRefCampaignBrowser.configure({ apiBase: 'https://app.test.example' })

      window.history.pushState(
        {},
        '',
        '/checkout?rcsid=sdkcap_sess_123456789&rctest=sdkcap_test_123456789',
      )

      FreshRefCampaignBrowser.captureSession()

      expect(fetchMock).not.toHaveBeenCalledWith(
        'https://app.test.example/api/sdk/session-captured',
        expect.anything(),
      )
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
      // Pre-set the install-ping debounce (scoped per apiBase) so configure()
      // below does not fire an extra /api/sdk/installed request that would
      // pollute the fetchMock assertions in these tests.
      window.localStorage.setItem('_rc_installed_at:https://app.test.example', String(Date.now()))
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
      // Suppress install-ping debounce (scoped per apiBase, trailing slash
      // normalized) so configure() below does not fire an extra request before
      // the identify() call we are asserting on.
      window.localStorage.setItem('_rc_installed_at:https://app.staging.example', String(Date.now()))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)
      RefCampaignBrowser.configure({ apiBase: 'https://app.staging.example///' })
      window.localStorage.setItem('_rc_sid', 'sess_x')

      await RefCampaignBrowser.identify('a@b.com')
      expect(fetchMock.mock.calls[0][0]).toBe('https://app.staging.example/api/track/identify')
    })

    it('fires an install-ping to <apiBase>/api/sdk/installed', async () => {
      // localStorage was cleared by the outer beforeEach, so the install-ping
      // debounce key (_rc_installed_at) is absent and sendInstallPing() will
      // fire on the configure() call below.
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)

      RefCampaignBrowser.configure({ apiBase: 'https://app.staging.example' })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.staging.example/api/sdk/installed',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    it('forwards the siteToken to the install-ping body', () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }))
      vi.stubGlobal('fetch', fetchMock)

      RefCampaignBrowser.configure({
        apiBase: 'https://app.staging.example',
        siteToken: 'rcst_abc',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        'https://app.staging.example/api/sdk/installed',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ siteToken: 'rcst_abc' }),
        }),
      )
    })
  })
})
