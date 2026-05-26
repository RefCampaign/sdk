import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendInstallPing } from '../install-ping'

const STORAGE_KEY = '_rc_installed_at'

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
    localStorage.setItem(STORAGE_KEY, String(Date.now() - 1000))
    sendInstallPing('https://app.example.com')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('re-fires fetch when last ping is > 24h old', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000
    localStorage.setItem(STORAGE_KEY, String(twentyFiveHoursAgo))
    sendInstallPing('https://app.example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('persists timestamp on 204 success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    sendInstallPing('https://app.example.com')
    // Wait for the .then() to run
    await new Promise((resolve) => setTimeout(resolve, 0))
    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(Number(stored)).toBeGreaterThan(Date.now() - 1000)
  })

  it('fires even when localStorage.getItem throws', () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked')
    })
    sendInstallPing('https://app.example.com')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('swallows network errors silently', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect(() => sendInstallPing('https://app.example.com')).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})
