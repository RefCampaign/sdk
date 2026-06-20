/**
 * RefCampaign SDK
 *
 * Official JavaScript SDK for RefCampaign affiliate tracking.
 * Universal vanilla JS library that works with any framework.
 *
 * @example
 * // Browser usage
 * import { RefCampaignBrowser } from '@refcampaign/sdk'
 *
 * const result = RefCampaignBrowser.captureSession()
 * console.log(result.sessionId)
 *
 * @example
 * // Server usage
 * import { RefCampaignServer } from '@refcampaign/sdk'
 *
 * const rc = new RefCampaignServer('rc_live_...')
 * const metadata = rc.getStripeMetadata(sessionId)
 *
 * @example
 * // Verify an inbound webhook (server-side)
 * import { verifyWebhookSignature } from '@refcampaign/sdk'
 *
 * const ok = verifyWebhookSignature({ secret, payload: rawBody, header })
 *
 * @packageDocumentation
 */

export { RefCampaignBrowser } from './browser'
export { RefCampaignServer } from './server'
export {
  verifyWebhookSignature,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_EVENT_TYPES,
} from './webhooks'

export type {
  RefCampaignServerConfig,
  ConversionData,
  ConversionType,
  TrackConversionResponse,
  RefundConversionData,
  RefundConversionResponse,
  PingResult,
  StripePingMode,
  SessionCaptureResult,
  SessionIdSource,
} from './types'

export type { VerifyWebhookSignatureOptions, WebhookEventType } from './webhooks'
