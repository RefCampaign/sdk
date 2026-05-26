/**
 * Passive SDK install verification.
 *
 * Fire-and-forget POST to `/api/sdk/installed` that lets the platform know a
 * given browser is running the SDK. Debounced to once per 24h per browser via
 * localStorage so we don't hammer the endpoint on every page load.
 *
 * Failures (network, localStorage blocked, etc.) are silently swallowed —
 * verification is a best-effort signal, not a critical path for tracking.
 */

const STORAGE_KEY = '_rc_installed_at'
const TTL_MS = 24 * 60 * 60 * 1000

export function sendInstallPing(apiBase: string): void {
  try {
    const lastPing = localStorage.getItem(STORAGE_KEY)
    if (lastPing && Date.now() - Number(lastPing) < TTL_MS) return
  } catch {
    // localStorage unavailable (Safari private, sandboxed iframe) — fire anyway
  }

  fetch(`${apiBase}/api/sdk/installed`, {
    method: 'POST',
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  })
    .then((res) => {
      if (res.ok || res.status === 204) {
        try {
          localStorage.setItem(STORAGE_KEY, String(Date.now()))
        } catch {
          // localStorage write blocked — debounce is best-effort, accept re-fire
        }
      }
    })
    .catch(() => {
      // Network noise — silent
    })
}
