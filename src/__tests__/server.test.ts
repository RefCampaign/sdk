import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RefCampaignServer } from '../server'

describe('RefCampaignServer', () => {
  describe('constructor', () => {
    it('should initialize with valid secret key', () => {
      expect(() => {
        new RefCampaignServer('sk_test_abc123')
      }).not.toThrow()
    })

    it('should throw error with invalid secret key', () => {
      expect(() => {
        new RefCampaignServer('pk_test_abc')
      }).toThrow(/Invalid secretKey/)
    })

    it('should throw error with short secret key', () => {
      expect(() => {
        new RefCampaignServer('sk_short')
      }).toThrow(/Invalid secretKey/)
    })

    it('should accept custom API URL', () => {
      const rc = new RefCampaignServer('sk_test_abc123', {
        apiUrl: 'https://custom.refcampaign.com',
      })
      expect(rc.getApiUrl()).toBe('https://custom.refcampaign.com')
    })

    it('should use default API URL', () => {
      const rc = new RefCampaignServer('sk_test_abc123')
      expect(rc.getApiUrl()).toBe('https://app.refcampaign.com')
    })
  })

  describe('getStripeMetadata', () => {
    let rc: RefCampaignServer

    beforeEach(() => {
      rc = new RefCampaignServer('sk_test_abc123')
    })

    it('should return metadata with valid session ID', () => {
      const metadata = rc.getStripeMetadata('test-session-123')
      expect(metadata).toEqual({
        refcampaign_session: 'test-session-123',
      })
    })

    it('should return empty metadata without session ID', () => {
      const metadata = rc.getStripeMetadata()
      expect(metadata).toEqual({})
    })

    it('should return empty metadata with invalid session ID', () => {
      const metadata = rc.getStripeMetadata('short')
      expect(metadata).toEqual({})
    })

    it('should handle UUID v4 session IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const metadata = rc.getStripeMetadata(uuid)
      expect(metadata).toEqual({
        refcampaign_session: uuid,
      })
    })
  })

  describe('trackConversion', () => {
    beforeEach(() => {
      global.fetch = vi.fn()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('posts to the postback endpoint with orderId mapped to externalId', async () => {
      // The platform wraps all handler returns in { success, data, meta }.
      // The mock must reflect the real envelope so the unwrap logic is exercised.
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { success: true, conversionId: 'conv_1' }, meta: { timestamp: 'x' } }),
      })

      const rc = new RefCampaignServer('sk_test_abcdefghij')
      const result = await rc.trackConversion({
        orderId: 'ORD-1',
        sessionId: 'test-session-123',
        amount: 4999,
        currency: 'EUR',
      })

      expect(result).toEqual({ success: true, conversionId: 'conv_1' })
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.refcampaign.com/api/v1/conversions/postback',
        expect.objectContaining({ method: 'POST' }),
      )
      const sentBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      )
      expect(sentBody.externalId).toBe('ORD-1')
      expect(sentBody.conversionType).toBe('SALE')
    })

    it('throws when orderId is missing', async () => {
      const rc = new RefCampaignServer('sk_test_abcdefghij')
      // @ts-expect-error orderId is required
      await expect(rc.trackConversion({ amount: 100, currency: 'EUR', sessionId: 'sess_abcdef12' }))
        .rejects.toThrow('orderId')
    })

    it('retries on a 5xx and succeeds', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: async () => 'down',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          // The successful retry must also return the enveloped shape.
          json: async () => ({ success: true, data: { success: true, conversionId: 'conv_2' }, meta: {} }),
        })

      const rc = new RefCampaignServer('sk_test_abcdefghij', { retry: { attempts: 2, baseDelayMs: 1 } })
      const result = await rc.trackConversion({
        orderId: 'ORD-2',
        amount: 100,
        currency: 'EUR',
        sessionId: 'sess_abcdef12',
      })

      expect(result.success).toBe(true)
      expect(result.conversionId).toBe('conv_2')
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('returns success:false after exhausting retries', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'boom',
      })
      const rc = new RefCampaignServer('sk_test_abcdefghij', { retry: { attempts: 2, baseDelayMs: 1 } })
      const result = await rc.trackConversion({
        orderId: 'ORD-3',
        amount: 100,
        currency: 'EUR',
        sessionId: 'sess_abcdef12',
      })
      expect(result.success).toBe(false)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('invokes onError with the error and orderId after a failed send', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'boom',
      })
      const onError = vi.fn()
      const rc = new RefCampaignServer('sk_test_abcdefghij', {
        retry: { attempts: 1, baseDelayMs: 1 },
        onError,
      })
      await rc.trackConversion({
        orderId: 'ORD-ERR',
        amount: 100,
        currency: 'EUR',
        sessionId: 'sess_abcdef12',
      })
      expect(onError).toHaveBeenCalledTimes(1)
      const [error, context] = onError.mock.calls[0]
      expect(error).toBeInstanceOf(Error)
      expect(context).toEqual({ orderId: 'ORD-ERR', attempts: 1 })
    })

    it('does not throw when the onError callback itself throws', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'boom',
      })
      const rc = new RefCampaignServer('sk_test_abcdefghij', {
        retry: { attempts: 1, baseDelayMs: 1 },
        onError: () => {
          throw new Error('callback blew up')
        },
      })
      const result = await rc.trackConversion({
        orderId: 'ORD-CB',
        amount: 100,
        currency: 'EUR',
        sessionId: 'sess_abcdef12',
      })
      expect(result.success).toBe(false)
    })

    it('should throw error with invalid amount', async () => {
      const rc = new RefCampaignServer('sk_test_abc123')
      await expect(
        rc.trackConversion({
          orderId: 'ORD-4',
          sessionId: 'test-session-123',
          amount: 49.99, // Should be 4999 (integer cents)
          currency: 'EUR',
        })
      ).rejects.toThrow(/Invalid amount/)
    })

    it('should throw error with invalid currency', async () => {
      const rc = new RefCampaignServer('sk_test_abc123')
      await expect(
        rc.trackConversion({
          orderId: 'ORD-5',
          sessionId: 'test-session-123',
          amount: 4999,
          currency: 'eur', // Should be 'EUR' (uppercase)
        })
      ).rejects.toThrow(/Invalid currency/)
    })

    it('should throw when neither sessionId nor customerEmailHash is provided', async () => {
      const rc = new RefCampaignServer('sk_test_abc123')
      await expect(
        rc.trackConversion({
          orderId: 'ORD-6',
          amount: 4999,
          currency: 'EUR',
        })
      ).rejects.toThrow(/sessionId or customerEmailHash/)
    })

    it('should include Authorization header with secret key', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { success: true, conversionId: 'conv_123' }, meta: {} }),
      })

      const rc = new RefCampaignServer('sk_test_abc123')
      await rc.trackConversion({
        orderId: 'ORD-7',
        sessionId: 'test-session-123',
        amount: 4999,
        currency: 'EUR',
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.refcampaign.com/api/v1/conversions/postback',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk_test_abc123',
          }),
        }),
      )
    })

    it('returns a malformed-response error when a 200 body is not valid JSON', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => { throw new Error('bad json') },
      })
      const rc = new RefCampaignServer('sk_test_abcdefghij')
      const result = await rc.trackConversion({ orderId: 'ORD-J', amount: 100, currency: 'EUR', sessionId: 'sess_abcdef12' })
      expect(result).toEqual({ success: false, error: 'Malformed success response from API' })
    })

    it('retries on a network error then succeeds', async () => {
      ;(global.fetch as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { success: true, conversionId: 'conv_net' }, meta: {} }),
        })
      const rc = new RefCampaignServer('sk_test_abcdefghij', { retry: { attempts: 2, baseDelayMs: 1 } })
      const result = await rc.trackConversion({ orderId: 'ORD-N', amount: 100, currency: 'EUR', sessionId: 'sess_abcdef12' })
      expect(result).toEqual({ success: true, conversionId: 'conv_net' })
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })
  })
})
