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
    }

    if (this.config.debug) {
      console.log('[RefCampaign] Server SDK initialized', {
        apiUrl: this.apiUrl,
        secretKey: secretKey.substring(0, 10) + '...',
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
   * @param data - Conversion data (amount, currency, sessionId)
   * @returns Promise with tracking result
   * @throws Error if validation fails or API request fails
   *
   * @example
   * const result = await rc.trackConversion({
   *   sessionId: 'abc123',
   *   amount: 4999, // €49.99
   *   currency: 'EUR',
   *   metadata: { plan: 'pro' }
   * })
   */
  async trackConversion(data: ConversionData): Promise<TrackConversionResponse> {
    // Validate data
    if (!validateAmount(data.amount)) {
      throw new Error('[RefCampaign] Invalid amount: must be a positive integer in cents')
    }

    if (!validateCurrency(data.currency)) {
      throw new Error('[RefCampaign] Invalid currency: must be a 3-letter ISO 4217 code')
    }

    if (data.sessionId && !validateSessionId(data.sessionId)) {
      throw new Error('[RefCampaign] Invalid sessionId format')
    }

    if (!data.sessionId) {
      throw new Error('[RefCampaign] sessionId is required for manual conversion tracking')
    }

    // Make API request
    const url = `${this.apiUrl}/api/conversions/track`

    try {
      if (this.config.debug) {
        console.log('[RefCampaign] Tracking conversion:', { url, data })
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.secretKey}`,
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `API request failed: ${response.status} ${response.statusText} - ${errorText}`
        )
      }

      const result = await response.json()

      if (this.config.debug) {
        console.log('[RefCampaign] Conversion tracked successfully:', result)
      }

      return result
    } catch (error) {
      if (this.config.debug) {
        console.error('[RefCampaign] Failed to track conversion:', error)
      }

      if (error instanceof Error) {
        return {
          success: false,
          error: error.message,
        }
      }

      return {
        success: false,
        error: 'Unknown error occurred',
      }
    }
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
