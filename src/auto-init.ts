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
const API_BASE_PARAM = 'apiBase'
const SITE_TOKEN_PARAM = 's'
const SITE_TOKEN_PREFIX = 'rcst_'

interface AugmentedWindow extends Window {
  __refcampaignLoaded?: boolean
  RefCampaignBrowser?: typeof RefCampaignBrowser
}

function siteTokenFromScriptSrc(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.href)
    const token = url.searchParams.get(SITE_TOKEN_PARAM)
    return token?.startsWith(SITE_TOKEN_PREFIX) ? token : undefined
  } catch {
    return undefined
  }
}

function apiBaseFromScriptSrc(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.href)
    const apiBase = url.searchParams.get(API_BASE_PARAM)
    return apiBase ? apiBase.replace(/\/+$/, '') : undefined
  } catch {
    return undefined
  }
}

function getCdnConfig(): { apiBase?: string; siteToken?: string } {
  const currentScript =
    document.currentScript instanceof HTMLScriptElement
      ? document.currentScript
      : null

  const scripts = currentScript
    ? [currentScript]
    : Array.from(document.scripts).reverse()

  for (const script of scripts) {
    const siteToken = siteTokenFromScriptSrc(script.src)
    const apiBase = apiBaseFromScriptSrc(script.src)
    if (siteToken || apiBase) return { apiBase, siteToken }
  }

  return {}
}

if (typeof window !== 'undefined') {
  const w = window as AugmentedWindow

  if (w.__refcampaignLoaded) {
    console.warn('[RefCampaign] SDK already loaded, skipping CDN auto-init')
  } else {
    // Read the CDN query before captureSession() so staging/self-hosted
    // browser-capture tests ping the same API that generated the test URL.
    const { apiBase, siteToken } = getCdnConfig()
    if (siteToken || apiBase) {
      RefCampaignBrowser.configure({ apiBase, siteToken })
    } else {
      sendInstallPing(DEFAULT_API_BASE)
    }
    RefCampaignBrowser.captureSession()
    w.RefCampaignBrowser = RefCampaignBrowser
    w.__refcampaignLoaded = true
  }
}
