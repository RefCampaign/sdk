import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendInstallPing } from '../install-ping'

const API = 'https://app.example.com'
// Debounce keys are scoped per apiBase: `_rc_installed_at:<apiBase>`.
const keyFor = (apiBase: string) => `_rc_installed_at:${apiBase}`

describe('sendInstallPing', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    localStorage.clear()
    fetchMock = vi.fn()
    originalFetch = globalThis.fetch
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('fires POST to /api/sdk/installed on first call', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    sendInstallPing('https://app.example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://app.example.com/api/sdk/installed', {
      method: 'POST',
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    })
  })

  it('skips fetch when last ping is < 24h old', () => {
    localStorage.setItem(keyFor(API), String(Date.now() - 1000))
    sendInstallPing(API)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-fires fetch when last ping is > 24h old', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000
    localStorage.setItem(keyFor(API), String(twentyFiveHoursAgo))
    sendInstallPing(API)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('persists timestamp on 204 success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    sendInstallPing(API)
    // Wait for the .then() to run
    await new Promise((resolve) => setTimeout(resolve, 0))
    const stored = localStorage.getItem(keyFor(API))
    expect(stored).not.toBeNull()
    expect(Number(stored)).toBeGreaterThan(Date.now() - 1000)
  })

  it('debounces per apiBase: a prod ping does not suppress a staging ping', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    const prod = 'https://app.refcampaign.com'
    const staging = 'https://app.test.refcampaign.com'

    // A recent prod ping is recorded under the prod-scoped key.
    localStorage.setItem(keyFor(prod), String(Date.now() - 1000))

    // Prod is debounced...
    sendInstallPing(prod)
    expect(fetchMock).not.toHaveBeenCalled()

    // ...but a staging override still fires (independent key).
    sendInstallPing(staging)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${staging}/api/sdk/installed`, expect.anything())
  })

  it('normalizes a trailing slash in the apiBase debounce key', () => {
    localStorage.setItem(keyFor(API), String(Date.now() - 1000))
    sendInstallPing(`${API}/`)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fires even when localStorage.getItem throws', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked')
    })
    sendInstallPing(API)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('swallows network errors silently', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect(() => sendInstallPing(API)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(localStorage.getItem(keyFor(API))).toBeNull()
  })

  it('carries the siteToken in a CORS-safelisted text/plain body when present', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    sendInstallPing(API, 'rcst_abc')
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/sdk/installed`, {
      method: 'POST',
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ siteToken: 'rcst_abc' }),
    })
  })

  it('scopes the debounce key by token so a tokenless ping does not suppress a token ping', () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    // A recent tokenless ping is recorded under the base key.
    localStorage.setItem(keyFor(API), String(Date.now() - 1000))

    // Tokenless ping is debounced...
    sendInstallPing(API)
    expect(fetchMock).not.toHaveBeenCalled()

    // ...but the token-carrying ping fires (independent key).
    sendInstallPing(API, 'rcst_abc')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API}/api/sdk/installed`,
      expect.objectContaining({ body: JSON.stringify({ siteToken: 'rcst_abc' }) }),
    )
  })
})
