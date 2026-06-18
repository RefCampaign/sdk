/**
 * RefCampaign Server API
 *
 * Server-side SDK for injecting Stripe metadata and tracking conversions.
 * Use this in Node.js environments (Next.js API routes, Express, etc.).
 */

import type {
  RefCampaignServerConfig,
  StripeMetadata,
  ConversionData,
  TrackConversionResponse,
  RefundConversionData,
  RefundConversionResponse,
} from './types'
import {
  validateSecretKey,
  validateSessionId,
  validateAmount,
  validateCurrency,
} from './utils/validation'

export class RefCampaignServer {
  private config: RefCampaignServerConfig
  private apiUrl: string

  /**
   * Initialize RefCampaign server SDK
   *
   * @param secretKey - Secret API key (starts with rc_live_ or rc_test_)
   * @param config - Optional configuration
   * @throws Error if secretKey is invalid
   *
   * @example
   * const rc = new RefCampaignServer('rc_live_...')
   */
  constructor(secretKey: string, config?: Partial<RefCampaignServerConfig>) {
    if (!validateSecretKey(secretKey)) {
      throw new Error(
        '[RefCampaign] Invalid secretKey: must start with "rc_live_" or "rc_test_" and be at least 10 characters long'
      )
    }

    this.apiUrl = config?.apiUrl || 'https://app.refcampaign.com'

    this.config = {
      secretKey,
      apiUrl: this.apiUrl,
      debug: config?.debug || false,
      timeoutMs: config?.timeoutMs,
      retry: config?.retry,
      onError: config?.onError,
    }

    if (this.config.debug) {
      console.log('[RefCampaign] Server SDK initialized', {
        apiUrl: this.apiUrl,
        // Never log any part of the secret key, even in debug.
        secretKey: '***',
      })
    }
  }

  /**
   * Get Stripe metadata with RefCampaign session ID
   *
   * This is the main use case for the SDK. Inject this metadata
   * into Stripe checkout sessions or payment intents.
   *
   * The sessionId can be provided explicitly, or will be auto-detected
   * from the request context (future enhancement).
   *
   * @param sessionId - Optional session ID (if not provided, returns empty metadata)
   * @returns Stripe metadata object
   *
   * @example
   * // With explicit sessionId
   * const metadata = rc.getStripeMetadata('abc123')
   *
   * // Create Stripe checkout with metadata
   * const checkout = await stripe.checkout.sessions.create({
   *   line_items: [{ price: 'price_xxx', quantity: 1 }],
   *   metadata: rc.getStripeMetadata('abc123')
   * })
   */
  getStripeMetadata(sessionId?: string): StripeMetadata {
    if (!sessionId) {
      if (this.config.debug) {
        console.warn('[RefCampaign] No sessionId provided for Stripe metadata')
      }
      return {}
    }

    if (!validateSessionId(sessionId)) {
      if (this.config.debug) {
        console.error('[RefCampaign] Invalid sessionId format:', sessionId)
      }
      return {}
    }

    if (this.config.debug) {
      console.log('[RefCampaign] Generated Stripe metadata for session:', sessionId)
    }

    return {
      refcampaign_session: sessionId,
    }
  }

  /**
   * Track conversion manually (for non-Stripe conversions)
   *
   * Use this when you have conversions that don't go through Stripe,
   * or when you want to track additional conversion events.
   *
   * @param data - Conversion data
   * @returns Promise with tracking result
   * @throws Error if validation fails
   *
   * @example
   * const result = await rc.trackConversion({
   *   orderId: 'ORD-123', // Required — used as idempotence key
   *   sessionId: 'abc123',
   *   amount: 4999, // €49.99
   *   currency: 'EUR',
   *   metadata: { plan: 'pro' }
   * })
   */
  async trackConversion(data: ConversionData): Promise<TrackConversionResponse> {
    if (!data.orderId || typeof data.orderId !== 'string') {
      throw new Error('[RefCampaign] orderId is required and used as the idempotence key')
    }
    if (!validateAmount(data.amount)) {
      throw new Error('[RefCampaign] Invalid amount: must be a positive integer in cents')
    }
    if (!validateCurrency(data.currency)) {
      throw new Error('[RefCampaign] Invalid currency: must be a 3-letter ISO 4217 code')
    }
    if (data.sessionId && !validateSessionId(data.sessionId)) {
      throw new Error('[RefCampaign] Invalid sessionId format')
    }
    if (!data.affiliateCode && !data.sessionId && !data.customerEmailHash) {
      throw new Error('[RefCampaign] affiliateCode, sessionId, or customerEmailHash is required for attribution')
    }

    const payload = {
      externalId: data.orderId,
      amount: data.amount,
      currency: data.currency,
      conversionType: data.conversionType ?? 'SALE',
      ...(data.affiliateCode ? { affiliateCode: data.affiliateCode } : {}),
      ...(data.sessionId ? { sessionId: data.sessionId } : {}),
      ...(data.customerEmailHash ? { customerEmailHash: data.customerEmailHash } : {}),
      ...(data.metadata ? { metadata: data.metadata } : {}),
    }

    return this.post<TrackConversionResponse>(
      `${this.apiUrl}/api/v1/conversions/postback`,
      payload,
      { orderId: data.orderId, operation: 'track' }
    )
  }

  /**
   * Refund a previously reported conversion (non-Stripe billing, e.g. Shopify)
   *
   * Reverses a conversion you reported via `trackConversion` (or any postback)
   * and claws back the associated affiliate commission — prorated for partial
   * refunds. The conversion must be in `APPROVED` state. The call is idempotent
   * on `orderId`: a second refund returns `alreadyRefunded: true`.
   *
   * @param data - Refund data (orderId required; amount optional for partial)
   * @returns Promise with refund result
   * @throws Error if validation fails
   *
   * @example
   * // Full refund
   * await rc.refundConversion({ orderId: 'ORD-123' })
   *
   * // Partial refund of €10.00 with a reason
   * await rc.refundConversion({ orderId: 'ORD-123', amount: 1000, reason: 'partial return' })
   */
  async refundConversion(data: RefundConversionData): Promise<RefundConversionResponse> {
    if (!data.orderId || typeof data.orderId !== 'string') {
      throw new Error('[RefCampaign] orderId is required to refund a conversion')
    }
    if (data.amount !== undefined && !validateAmount(data.amount)) {
      throw new Error('[RefCampaign] Invalid amount: must be a positive integer in cents')
    }

    const payload = {
      externalId: data.orderId,
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.reason ? { reason: data.reason } : {}),
    }

    return this.post<RefundConversionResponse>(
      `${this.apiUrl}/api/v1/conversions/refund`,
      payload,
      { orderId: data.orderId, operation: 'refund' }
    )
  }

  /**
   * Shared POST with timeout, exponential-backoff retry on 429/5xx, response
   * envelope unwrapping, and `onError` reporting. Used by both
   * `trackConversion` and `refundConversion`.
   */
  private async post<T extends { success: boolean; error?: string }>(
    url: string,
    payload: Record<string, unknown>,
    context: { orderId: string; operation: 'track' | 'refund' }
  ): Promise<T> {
    // Guard against a misconfigured attempts value of 0 or negative, which
    // would silently skip the call entirely.
    const attempts = Math.max(1, this.config.retry?.attempts ?? 3)
    const baseDelayMs = this.config.retry?.baseDelayMs ?? 300
    const timeoutMs = this.config.timeoutMs ?? 10000

    let lastError = 'Unknown error occurred'
    const reportFailure = (failedAttempts: number) => {
      try {
        this.config.onError?.(new Error(lastError), {
          orderId: context.orderId,
          attempts: failedAttempts,
          operation: context.operation,
        })
      } catch {
        // A throwing onError callback must never break the call.
      }
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.secretKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        if (response.ok) {
          try {
            const parsed: { data?: T } & T = await response.json()
            // The platform wraps every handler return in { success, data, meta }.
            // Unwrap to the inner payload; fall back to the raw body defensively
            // in case an environment doesn't apply the envelope.
            return (parsed?.data ?? parsed) as T
          } catch {
            return { success: false, error: 'Malformed success response from API' } as T
          }
        }

        const retryable = response.status === 429 || response.status >= 500
        lastError = `API request failed: ${response.status} ${response.statusText} - ${await response.text()}`
        if (!retryable) {
          reportFailure(attempt)
          return { success: false, error: lastError } as T
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error occurred'
      } finally {
        clearTimeout(timer)
      }

      if (attempt < attempts) {
        const backoff = baseDelayMs * 2 ** (attempt - 1)
        const jitter = Math.floor(Math.random() * baseDelayMs)
        await new Promise((resolve) => setTimeout(resolve, backoff + jitter))
      }
    }

    if (this.config.debug) {
      console.error(`[RefCampaign] Failed to ${context.operation} after retries:`, lastError)
    }
    reportFailure(attempts)
    return { success: false, error: lastError } as T
  }

  /**
   * Get API URL
   * @internal
   */
  getApiUrl(): string {
    return this.apiUrl
  }

  /**
   * Get debug mode status
   * @internal
   */
  isDebugEnabled(): boolean {
    return this.config.debug || false
  }
}
