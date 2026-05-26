/**
 * Auto-init runs SIDE EFFECTS at module-load time (no exported function),
 * so each test must :
 *   1. Reset window state (`__refcampaignLoaded`, `RefCampaignBrowser`)
 *   2. Set up the script tag / DOM precondition
 *   3. Use `vi.resetModules()` so the auto-init module is re-imported fresh
 *   4. Dynamically import the module to trigger the side effects
 *
 * Vitest's `happy-dom` provides `document.currentScript`, `document.scripts`,
 * and `console.warn` mocking out of the box.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface AugmentedWindow extends Window {
  __refcampaignLoaded?: boolean
  RefCampaignBrowser?: unknown
}

function resetWindow(): void {
  const w = window as AugmentedWindow
  delete w.__refcampaignLoaded
  delete w.RefCampaignBrowser
}

function clearDom(): void {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
}

describe('auto-init (CDN bundle entry)', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetWindow()
    clearDom()
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Stub fetch — auto-init now fires sendInstallPing() which would
    // otherwise issue a real network request and pollute teardown logs.
    originalFetch = globalThis.fetch
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 })) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('initialises captureSession on script load', async () => {
    // Inject a script tag matching the production CDN URL pattern. The
    // current SDK contract is "load the script, captureSession runs" — no
    // attribute required. The script tag itself is here just so the DOM
    // mirrors a realistic install.
    const script = document.createElement('script')
    script.src = 'https://sdk.refcampaign.com/v1.js'
    document.head.appendChild(script)

    await import('../auto-init')

    const w = window as AugmentedWindow
    expect(w.__refcampaignLoaded).toBe(true)
    expect(w.RefCampaignBrowser).toBeDefined()
    expect(console.warn).not.toHaveBeenCalled()
    // Install-ping wiring: exactly one POST to /api/sdk/installed on first
    // load. Locks in the auto-init → sendInstallPing wiring so a regression
    // (removed import, missing call) is caught immediately.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url] = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    expect(String(url)).toMatch(/\/api\/sdk\/installed$/)
  })

  it('skips re-init when SDK is already loaded', async () => {
    const w = window as AugmentedWindow
    w.__refcampaignLoaded = true
    // Even with a script tag in the DOM, the guard short-circuits.
    const script = document.createElement('script')
    script.src = 'https://sdk.refcampaign.com/v1.js'
    document.head.appendChild(script)

    await import('../auto-init')

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('SDK already loaded'),
    )
    // Crucially: the global RefCampaignBrowser was NOT (re-)assigned.
    expect(w.RefCampaignBrowser).toBeUndefined()
    // And no install-ping is fired when the guard short-circuits.
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('exposes window.RefCampaignBrowser for advanced usage', async () => {
    const script = document.createElement('script')
    script.src = 'https://sdk.refcampaign.com/v1.js'
    document.head.appendChild(script)

    await import('../auto-init')

    const w = window as AugmentedWindow & {
      RefCampaignBrowser?: { captureSession: () => unknown; identify: (e: string) => unknown }
    }
    expect(w.RefCampaignBrowser).toBeDefined()
    expect(typeof w.RefCampaignBrowser?.captureSession).toBe('function')
    expect(typeof w.RefCampaignBrowser?.identify).toBe('function')
  })

  it('initialises even when no script tag is present in the DOM', async () => {
    // The auto-init no longer needs to locate its own tag (the legacy
    // `data-rc-account` read is gone). It runs unconditionally on first
    // load — the script src in the merchant's site is the only requirement.
    await import('../auto-init')

    const w = window as AugmentedWindow
    expect(w.__refcampaignLoaded).toBe(true)
    expect(w.RefCampaignBrowser).toBeDefined()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('ignores a legacy data-rc-account attribute (backward compat)', async () => {
    // Existing merchants may still have the legacy attribute on their site.
    // The SDK should silently ignore it — tracking continues to work.
    const script = document.createElement('script')
    script.src = 'https://sdk.refcampaign.com/v1.js'
    script.setAttribute('data-rc-account', 'acc_legacy_xyz')
    document.head.appendChild(script)

    await import('../auto-init')

    const w = window as AugmentedWindow
    expect(w.__refcampaignLoaded).toBe(true)
    expect(w.RefCampaignBrowser).toBeDefined()
    expect(console.warn).not.toHaveBeenCalled()
  })
})
