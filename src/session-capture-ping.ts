/**
 * Browser session-capture verification ping.
 *
 * Fired only for dashboard-generated SDK tests (`rctest` in the URL). It does
 * not affect attribution and intentionally carries only public setup data.
 */

interface SessionCapturePingPayload {
  siteToken: string
  testId: string
  sessionId: string
  source: 'url'
}

export function sendSessionCapturePing(
  apiBase: string,
  payload: SessionCapturePingPayload,
): void {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    keepalive: true,
    mode: 'cors',
    credentials: 'omit',
  }

  fetch(`${apiBase}/api/sdk/session-captured`, init).catch(() => {
    // Best-effort verification signal. Never disrupt the merchant page.
  })
}
