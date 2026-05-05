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
    let rc: RefCampaignServer

    beforeEach(() => {
      rc = new RefCampaignServer('sk_test_abc123')
      // Mock fetch
      global.fetch = vi.fn()
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should throw error without session ID', async () => {
      await expect(
        rc.trackConversion({
          amount: 4999,
          currency: 'EUR',
        })
      ).rejects.toThrow(/sessionId is required/)
    })

    it('should throw error with invalid amount', async () => {
      await expect(
        rc.trackConversion({
          sessionId: 'test-session-123',
          amount: 49.99, // Should be 4999 (integer cents)
          currency: 'EUR',
        })
      ).rejects.toThrow(/Invalid amount/)
    })

    it('should throw error with invalid currency', async () => {
      await expect(
        rc.trackConversion({
          sessionId: 'test-session-123',
          amount: 4999,
          currency: 'eur', // Should be 'EUR' (uppercase)
        })
      ).rejects.toThrow(/Invalid currency/)
    })

    it('should make API request with valid data', async () => {
      const mockResponse = {
        success: true,
        conversionId: 'conv_123',
      }

      ;(global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await rc.trackConversion({
        sessionId: 'test-session-123',
        amount: 4999,
        currency: 'EUR',
      })

      expect(result).toEqual(mockResponse)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.refcampaign.com/api/conversions/track',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer sk_test_abc123',
          }),
        })
      )
    })

    it('should handle API errors gracefully', async () => {
      ;(global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Error details',
      })

      const result = await rc.trackConversion({
        sessionId: 'test-session-123',
        amount: 4999,
        currency: 'EUR',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('API request failed')
    })
  })
})
