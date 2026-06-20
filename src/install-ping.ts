/**
 * Passive SDK install verification.
 *
 * Fire-and-forget POST to `/api/sdk/installed` that lets the platform know a
 * given browser is running the SDK. The platform resolves the merchant solely
 * by the per-account `siteToken` (`rcst_*`) — a ping without a token is a
 * server-side no-op (kept only as a backward signal for older callers).
 *
 * Debounced to once per 24h per browser via localStorage so we don't hammer
 * the endpoint on every page load.
 *
 * Failures (network, localStorage blocked, etc.) are silently swallowed —
 * verification is a best-effort signal, not a critical path for tracking.
 */

const STORAGE_KEY = '_rc_installed_at'
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * The debounce key is scoped to the apiBase AND the token. Without the apiBase
 * scope, the module-level ping to the default prod base sets a single global
 * key, and a later `configure({ apiBase })` override (staging / self-hosted)
 * is debounced away and never reaches its environment. Without the token
 * scope, the tokenless module-level ping (a server no-op) would debounce away
 * the subsequent token-carrying `configure({ siteToken })` ping that actually
 * verifies the install. Per-(base, token) keys keep them independent.
 */
function debounceKey(apiBase: string, siteToken?: string): string {
  const base = `${STORAGE_KEY}:${apiBase.replace(/\/+$/, '')}`
  return siteToken ? `${base}:${siteToken}` : base
}

export function sendInstallPing(apiBase: string, siteToken?: string, debug = false): void {
  const key = debounceKey(apiBase, siteToken)

  try {
    const lastPing = localStorage.getItem(key)
    if (lastPing && Date.now() - Number(lastPing) < TTL_MS) return
  } catch {
    // localStorage unavailable (Safari private, sandboxed iframe) — fire anyway
  }

  // When a token is present, carry it in the body. `text/plain` keeps the
  // request CORS-safelisted (no preflight); the platform parses the JSON body
  // regardless of content-type. Without a token, send a bodyless ping (no-op
  // server-side, retained as a backward signal).
  const init: RequestInit = {
    method: 'POST',
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  }
  if (siteToken) {
    init.headers = { 'Content-Type': 'text/plain' }
    init.body = JSON.stringify({ siteToken })
  }

  fetch(`${apiBase}/api/sdk/installed`, init)
    .then((res) => {
      if (res.ok || res.status === 204) {
        if (debug) console.log('[RefCampaign] Install ping acknowledged')
        try {
          localStorage.setItem(key, String(Date.now()))
        } catch {
          // localStorage write blocked — debounce is best-effort, accept re-fire
        }
      } else if (debug) {
        console.warn('[RefCampaign] Install ping rejected:', res.status, res.statusText)
      }
    })
    .catch((error) => {
      // Network noise — silent unless the merchant opted into debug.
      if (debug) console.warn('[RefCampaign] Install ping failed:', error)
    })
}
