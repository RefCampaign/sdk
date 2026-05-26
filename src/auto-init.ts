/**
 * IIFE auto-init entry — only used by the CDN bundle (`dist/refcampaign.js`).
 *
 * Mounted as `<script src="https://sdk.refcampaign.com/v1.js" async></script>`,
 * this entry self-bootstraps on script load:
 *   1. Idempotency guard: bails if `window.__refcampaignLoaded` is already set
 *      (catches the merchant who accidentally loads the CDN snippet twice OR
 *      mixes CDN with a bundler-based npm import).
 *   2. Runs `captureSession()` so the cookie/localStorage are populated on
 *      the visitor's first hit. The SDK's `apiBase` defaults to
 *      `https://app.refcampaign.com`; staging consumers override it
 *      post-load via `window.RefCampaignBrowser.configure({ apiBase: ... })`.
 *   3. Exposes `window.RefCampaignBrowser` for advanced use (e.g. the
 *      merchant calling `identify(email)` on signup).
 *
 * Backward compat: existing merchants may still have a script tag with the
 * legacy `data-rc-account="<id>"` attribute. The SDK silently ignores it ;
 * tracking continues to work without modification on the merchant's site.
 *
 * The npm-import path (`browser.ts` direct import) does NOT go through this
 * file — see `index.ts` for the canonical exports.
 */

import { RefCampaignBrowser } from './browser'
import { sendInstallPing } from './install-ping'

const DEFAULT_API_BASE = 'https://app.refcampaign.com'

interface AugmentedWindow extends Window {
  __refcampaignLoaded?: boolean
  RefCampaignBrowser?: typeof RefCampaignBrowser
}

if (typeof window !== 'undefined') {
  const w = window as AugmentedWindow

  if (w.__refcampaignLoaded) {
    console.warn('[RefCampaign] SDK already loaded, skipping CDN auto-init')
  } else {
    // Note: we DON'T call configure({ apiBase: ... }) — the SDK already
    // defaults to https://app.refcampaign.com. Hardcoding the prod URL here
    // would break staging consumers who override post-load via
    // `window.RefCampaignBrowser.configure({ apiBase: ... })`.
    RefCampaignBrowser.captureSession()
    sendInstallPing(DEFAULT_API_BASE)
    w.RefCampaignBrowser = RefCampaignBrowser
    w.__refcampaignLoaded = true
  }
}
