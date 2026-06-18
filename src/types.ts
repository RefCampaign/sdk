/**
 * RefCampaign SDK Types
 */

/**
 * Conversion type
 */
export type ConversionType = 'SALE' | 'LEAD' | 'TRIAL' | 'CUSTOM'

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
  /** Per-request timeout in ms (default: 10000) */
  timeoutMs?: number
  /** Retry policy for transient failures */
  retry?: {
    /** Total attempts including the first (default: 3) */
    attempts?: number
    /** Base backoff delay in ms (default: 300) */
    baseDelayMs?: number
  }
  /**
   * Invoked when a server request ultimately fails (non-retryable error or
   * exhausted retries). Wire your own monitoring (Sentry, logs, alerting)
   * here — a conversion or refund that never reaches the API would otherwise
   * be silent. A throwing callback is caught and never breaks the call.
   * `operation` distinguishes `trackConversion` from `refundConversion`.
   */
  onError?: (
    error: Error,
    context: { orderId: string; attempts: number; operation: 'track' | 'refund' }
  ) => void
}

/**
 * Conversion data for manual tracking
 */
export interface ConversionData {
  /** Merchant order id — used as the idempotence key (externalId). Required. */
  orderId: string
  /** Conversion amount in cents (e.g., 4999 for €49.99) */
  amount: number
  /** Currency code (ISO 4217) */
  currency: string
  /** Conversion type (default: 'SALE') */
  conversionType?: ConversionType
  /** Session ID for attribution (preferred) */
  sessionId?: string
  /** Affiliate tracking code for server-side code attribution */
  affiliateCode?: string
  /** SHA-256 hex of the customer email, fallback attribution */
  customerEmailHash?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Data for refunding a previously reported conversion
 */
export interface RefundConversionData {
  /** Merchant order id used when the conversion was reported (externalId). Required. */
  orderId: string
  /** Partial refund amount in cents. Omit for a full refund. */
  amount?: number
  /** Optional reason, recorded in the commission clawback ledger (1–500 chars). */
  reason?: string
}

/**
 * API response for a conversion refund
 */
export interface RefundConversionResponse {
  success: boolean
  conversionId?: string
  /** True when the conversion was already refunded — idempotent no-op. */
  alreadyRefunded?: boolean
  /** Human-readable note, e.g. "Conversion already refunded" on an idempotent repeat. */
  message?: string
  error?: string
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
