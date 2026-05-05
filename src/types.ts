/**
 * RefCampaign SDK Types
 */


/**
 * Configuration for server-side SDK
 */
export interface RefCampaignServerConfig {
  /** Secret API key (starts with sk_) */
  secretKey: string
  /** Base URL for RefCampaign API (default: https://app.refcampaign.com) */
  apiUrl?: string
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Conversion data for manual tracking
 */
export interface ConversionData {
  /** Session ID (optional, will be auto-detected if not provided) */
  sessionId?: string
  /** Conversion amount in cents (e.g., 4999 for €49.99) */
  amount: number
  /** Currency code (ISO 4217) */
  currency: string
  /** Additional metadata */
  metadata?: Record<string, any>
}

/**
 * Stripe metadata format expected by RefCampaign webhooks
 */
export interface StripeMetadata {
  /** RefCampaign session ID */
  refcampaign_session?: string
}

/**
 * API response for conversion tracking
 */
export interface TrackConversionResponse {
  success: boolean
  conversionId?: string
  error?: string
}

/**
 * Session ID source
 */
export type SessionIdSource = 'url' | 'cookie' | 'localStorage' | 'none'

/**
 * Storage method result
 */
export interface StorageResult {
  success: boolean
  method: 'cookie' | 'localStorage' | 'none'
  error?: string
}

/**
 * Session capture result
 */
export interface SessionCaptureResult {
  sessionId: string | null
  source: SessionIdSource
}
