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
 * const rc = new RefCampaignServer('sk_prod_abc123')
 * const metadata = rc.getStripeMetadata(sessionId)
 *
 * @packageDocumentation
 */

export { RefCampaignBrowser } from './browser'
export { RefCampaignServer } from './server'

export type {
  RefCampaignServerConfig,
  ConversionData,
  ConversionType,
  TrackConversionResponse,
  SessionCaptureResult,
  SessionIdSource,
} from './types'
