# Changelog

All notable changes to the RefCampaign SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.3.0] - 2026-06-18

### Added

- **`RefCampaignServer.refundConversion()`.** Server-side wrapper for
  `POST /api/v1/conversions/refund` — the counterpart to `trackConversion()`.
  Reverses a previously reported conversion and claws back the affiliate
  commission (prorated for partial refunds). Accepts `{ orderId, amount?, reason? }`:
  omit `amount` for a full refund. Idempotent on `orderId` — a repeat call resolves
  with `alreadyRefunded: true`. Shares the same retry/timeout/`onError` plumbing as
  `trackConversion`. New exported types `RefundConversionData` and
  `RefundConversionResponse`.

### Changed

- The `onError` callback context gains an `operation: 'track' | 'refund'` field so
  monitoring can tell the two calls apart. Additive — existing handlers keep working.

## [2.2.0] - 2026-06-17

### Added

- **Affiliate code postback attribution.** `ConversionData` accepts a new
  optional `affiliateCode` field, letting server-side conversions attribute
  directly from an affiliate's tracking code — a third attribution path
  alongside `sessionId` (preferred) and `customerEmailHash` (fallback). The
  postback validation now accepts a request carrying any one of the three;
  `affiliateCode` is forwarded to `/api/v1/conversions/postback` when present.
  Backward-compatible: existing `sessionId` / `customerEmailHash` callers are
  unchanged.

## [2.1.1] - 2026-06-16

### Fixed

- **`identify()` no longer hangs an awaiting caller.** The request now runs under
  a 3s `AbortController` timeout (it previously had none), so awaiting it inside
  a login/signup handler can no longer freeze the merchant's flow on a stalled
  connection. Still best-effort — timeouts and network errors are swallowed.
- **Cookie parsing preserves `=` in values.** `parseCookies` split on every `=`,
  truncating any cookie value that itself contained one (base64 padding, JWTs).
  It now splits on the first `=` only.
- **Cross-subdomain attribution on ccTLDs.** `getCookieDomain` returned a bare
  public suffix (e.g. `.co.uk`) for hosts like `shop.acme.co.uk`, which browsers
  reject — silently dropping the parent-domain cookie. A small set of common
  2-level suffixes (`.co.uk`, `.com.br`, `.com.au`, …) now falls back to the
  registrable domain (`.acme.co.uk`).

### Security

- **No plaintext session cookie on insecure http.** On a real (non-localhost)
  http origin the SDK now skips writing the `_rc_sid` cookie — which would lack
  `Secure` and travel in cleartext — and relies on localStorage instead, warning
  once. The session id gates commission attribution, so this avoids a
  network-readable/forgeable token.

## [2.1.0] - 2026-06-05

### Added

- **Browser session-capture verification.** When a dashboard-generated test URL
  carries an `rctest` parameter, the browser SDK fires a best-effort ping to
  `/api/sdk/session-captured` so the dashboard can confirm the SDK captured the
  session. The ping carries only public setup data (`siteToken`, `testId`,
  `sessionId`) and never affects attribution. The `rctest` parameter is stripped
  from the URL alongside `rcsid` / `_rcid`.
- **CDN script configuration via query parameters.** The auto-init bundle now
  reads `apiBase` and a `s` site token (`rcst_…`) from its own `<script src>`
  query string, so dashboard/staging test installs target the same API that
  generated the test URL.

### Fixed

- Route the browser capture ping to the configured `apiBase` instead of the
  hardcoded production URL, so staging and self-hosted installs verify against
  the correct backend.

## [2.0.0] - 2026-05-31

This release reworks server-side conversion tracking. The previous `1.5.1` and
`1.6.0` entries were never published to npm — their changes are folded into this
`2.0.0` release.

### BREAKING

- **`RefCampaignServer.trackConversion()` now requires an `orderId`** and posts to
  the `/api/v1/conversions/postback` endpoint. `orderId` is the merchant order ID,
  used as the server-side idempotence key (mapped to `externalId`), so retries and
  duplicate webhooks never double-count a conversion. Calls that previously passed
  only `{ amount, currency, sessionId }` now throw
  `"[RefCampaign] orderId is required and used as the idempotence key"` at runtime.

  **Migration:** add `orderId` (a stable, unique id for the order/transaction) to
  every `trackConversion(...)` call:

  ```diff
   await rc.trackConversion({
  +  orderId: order.id,
     amount: 4999,
     currency: 'eur',
     sessionId,
   })
  ```

### Added

- **Automatic retries on transient failures** (HTTP 429 / 5xx / network) with
  exponential backoff. Tune via `new RefCampaignServer(key, { retry: { attempts, baseDelayMs } })`
  (defaults: 3 attempts, 300 ms base delay).
- **`onError` callback** — `new RefCampaignServer(key, { onError: (error, { orderId, attempts }) => ... })`
  fires when a conversion send ultimately fails after all retries, so you can wire
  it to your monitoring. A throwing `onError` never breaks `trackConversion`.
- **`conversionType`** on `ConversionData` (`'SALE' | 'LEAD' | 'TRIAL' | 'CUSTOM'`,
  default `'SALE'`) and `customerEmailHash` as an explicit fallback-attribution field.
- **`configure({ siteToken })`** (browser SDK) carries the per-account install token
  (`rcst_*`) on the install ping (`POST /api/sdk/installed`), sent in a
  CORS-safelisted `text/plain` body so no preflight is triggered. The platform
  verifies SDK installs solely by this token (npm path) or by the CDN Worker
  forwarding the `v1.js?s=<token>` URL — never by matching the page's domain. npm
  consumers should pass `siteToken` (shown on the dashboard SDK setup page) to get
  install verification. The debounce key is scoped per `(apiBase, token)` so a
  tokenless ping never suppresses the token-carrying one.

### Fixed

- `trackConversion` now unwraps the API response envelope (`{ data: ... }`) so the
  returned object is the conversion payload directly. Malformed-body and retry
  paths are hardened.
- Install-ping debounce is scoped per `apiBase` (key `_rc_installed_at:<apiBase>`)
  instead of a single global key, so a `configure({ apiBase })` override
  (staging / self-hosted) is no longer debounced away by the prod-default ping.

### Changed

- The server SDK no longer logs the secret-key prefix.

## [1.5.0] - 2026-05-26

### Added
- Passive install ping (`POST /api/sdk/installed`) fired once per 24h per
  browser at SDK boot. Enables RefCampaign to verify installations using
  any pattern (CDN `<script>`, Next.js `<Script strategy="afterInteractive">`,
  `lazyOnload`, bundled npm import, etc.) without requiring HTML scanning.
  Verification is automatic on first visit to the merchant's site.

## [1.4.0] - 2026-05-09

### Fixed
- **Cross-domain cookie attribution on apex domains**: when a merchant installs the SDK on their apex domain (`acme.com`, no `www.`), the session cookie is now scoped to `.acme.com` so it survives the navigation to subdomains like `app.acme.com` at signup time. Previously the cookie was set without a `Domain` attribute, making it host-only — `app.acme.com` couldn't read it and attribution was lost across the domain hop.
- Subdomain installs (e.g. `www.acme.com`, `shop.acme.com`) are unchanged — they already correctly scoped the cookie to the parent domain.

### Notes
- Known limitation: ccTLDs with multi-level effective TLDs (`.co.uk`, `.com.br`, etc.) on a 3-part hostname will compute a domain that browsers reject (because it's in the Public Suffix List). The cookie won't persist in that case ; attribution falls back to URL-param session reuse on the next page load. Properly handling PSL would require shipping a 100KB+ list — deferred until a merchant actually hits it.

## [1.3.0] - 2026-05-09

### Changed
- **CDN snippet simplified**: removed the `data-rc-account` attribute from the recommended `<script>` tag. The attribute was a leftover from a removed heartbeat feature — the SDK never used the value at runtime, but exposing the merchant identifier in the public HTML was a gratuitous data leak. The new snippet is `<script src="https://sdk.refcampaign.com/v1.js" async></script>`.

### Notes
- **Backward compatible**: existing installations with the legacy `data-rc-account="..."` attribute continue to work — the SDK silently ignores the attribute. Merchants who re-copy the snippet from their dashboard will pick up the simpler version automatically.

## [1.2.0] - 2026-05-08

### Added
- **CDN distribution** via `<script src="https://sdk.refcampaign.com/v1.js" data-rc-account="..." async></script>`. The new IIFE bundle (`dist/refcampaign.js`, ~5 KB raw / 2 KB gzip) self-bootstraps on script load: reads the `data-rc-account` attribute, runs `captureSession()`, and exposes `window.RefCampaignBrowser` for advanced usage. Targets no-code platforms (Webflow, Framer, WordPress) and merchants who prefer a one-line install over a bundler-based npm import.
- New build pipeline: `pnpm build` now produces both the npm package outputs (`dist/index.cjs`, `dist/index.mjs`, `dist/index.d.ts`) and the IIFE bundle (`dist/refcampaign.js`). Bundle size is enforced by `scripts/check-iife-bundle-size.mjs` (raw < 30 KB hard cap, gzip < 10 KB soft warning).

### Changed
- `RefCampaignBrowser` (npm import) now warns to console if `window.__refcampaignLoaded` is already set. This catches the merchant who accidentally loads the CDN snippet AND imports from `@refcampaign/sdk` in their bundler — both paths share the same cookie/localStorage keys so it works, but doubles the network calls. The warning surfaces during integration so the merchant can pick one path.

### Notes
- **Backward compatible**: existing 1.1.x integrations continue to work unchanged. The npm `RefCampaignBrowser` and `RefCampaignServer` API surface is identical; the IIFE bundle is purely additive.
- **Choose ONE browser path**: CDN script tag OR npm `RefCampaignBrowser` import. Server-side npm `RefCampaignServer` is unaffected and required either way for Stripe metadata injection.

## [1.1.0] - 2026-05-01

### Added
- `RefCampaignBrowser.identify(email)` — attaches a SHA-256 hash of the customer email to the current click, enabling email-hash fallback attribution when cookies and localStorage are gone (Safari ITP, cross-device, incognito). The email is hashed client-side via Web Crypto and never transmitted in plain text.
- `RefCampaignBrowser.configure({ apiBase })` — overrides the RefCampaign API base URL for staging or self-hosted deployments. Defaults to `https://app.refcampaign.com`.

### Notes
- Email hashing is performed in the browser via Web Crypto SHA-256; raw values never leave the user's device. Mirrors the standard pseudo-anonymization used by Meta CAPI and Google Conversions API.
- `identify()` is fire-and-forget, idempotent (server enforces first-write-wins), and silent on network errors — never disrupts the merchant's flow.
- Backward compatible: existing 1.0.x integrations continue to work unchanged. Adopting `identify()` is opt-in and additive.

## [1.0.1] - 2024-11-21

### Changed
- Extended session tracking duration from 30 days to 90 days
- Updated attribution window for improved conversion tracking
- Enhanced long-term affiliate attribution capabilities

### Technical Details
- Browser SDK: Cookie and localStorage expiration extended to 90 days
- Tracking Worker: Attribution cookie Max-Age updated to 7,776,000 seconds (90 days)
- Redis TTL: Click data storage extended to 90 days
- SQL queries: Attribution window updated to 90-day interval

## [1.0.0] - 2024-11-20

### Added
- Initial release of RefCampaign SDK
- Browser-side session capture from URL parameters, cookies, and localStorage
- Server-side Stripe metadata injection for automatic conversion tracking
- Manual conversion tracking API for non-Stripe payments
- TypeScript support with full type definitions
- Cross-domain tracking with automatic cookie domain detection
- Fallback mechanisms for environments with restricted cookies/storage