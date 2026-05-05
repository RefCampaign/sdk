# Changelog

All notable changes to the RefCampaign SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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