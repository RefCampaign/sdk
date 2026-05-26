# Changelog

All notable changes to the RefCampaign SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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