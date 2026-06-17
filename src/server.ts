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
   * @param secretKey - Secret API key (starts with sk_)
   * @param config - Optional configuration
   * @throws Error if secretKey is invalid
   *
   * @example
   * const rc = new RefCampaignServer('sk_prod_abc123')
   */
  constructor(secretKey: string, config?: Partial<RefCampaignServerConfig>) {
    if (!validateSecretKey(secretKey)) {
      throw new Error(
        '[RefCampaign] Invalid secretKey: must start with "sk_" and be at least 10 characters long'
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

    const url = `${this.apiUrl}/api/v1/conversions/postback`
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

    // Guard against a misconfigured attempts value of 0 or negative, which
    // would silently skip the call entirely.
    const attempts = Math.max(1, this.config.retry?.attempts ?? 3)
    const baseDelayMs = this.config.retry?.baseDelayMs ?? 300
    const timeoutMs = this.config.timeoutMs ?? 10000

    let lastError = 'Unknown error occurred'
    const reportFailure = (failedAttempts: number) => {
      try {
        this.config.onError?.(new Error(lastError), {
          orderId: data.orderId,
          attempts: failedAttempts,
        })
      } catch {
        // A throwing onError callback must never break trackConversion.
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
            const parsed: { data?: TrackConversionResponse } & TrackConversionResponse =
              await response.json()
            // The platform wraps every handler return in { success, data, meta }.
            // Unwrap to the inner payload; fall back to the raw body defensively
            // in case an environment doesn't apply the envelope.
            return (parsed?.data ?? parsed) as TrackConversionResponse
          } catch {
            return { success: false, error: 'Malformed success response from API' }
          }
        }

        const retryable = response.status === 429 || response.status >= 500
        lastError = `API request failed: ${response.status} ${response.statusText} - ${await response.text()}`
        if (!retryable) {
          reportFailure(attempt)
          return { success: false, error: lastError }
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
      console.error('[RefCampaign] Failed to track conversion after retries:', lastError)
    }
    reportFailure(attempts)
    return { success: false, error: lastError }
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
