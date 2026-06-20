import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  verifyWebhookSignature,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_SIGNATURE_HEADER,
} from '../webhooks'

const SECRET = 'whsec_test_secret'
const PAYLOAD = JSON.stringify({ event: 'conversion.created', data: { id: 'conv_1' } })

function buildHeader(payload: string, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${signature}`
}

describe('verifyWebhookSignature', () => {
  const now = new Date('2026-06-19T12:00:00.000Z')
  const nowSeconds = Math.floor(now.getTime() / 1000)

  it('accepts a valid, fresh signature', () => {
    const header = buildHeader(PAYLOAD, SECRET, nowSeconds)
    expect(verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header, now })).toBe(true)
  })

  it('rejects a tampered payload', () => {
    const header = buildHeader(PAYLOAD, SECRET, nowSeconds)
    const tampered = PAYLOAD.replace('conv_1', 'conv_999')
    expect(verifyWebhookSignature({ secret: SECRET, payload: tampered, header, now })).toBe(false)
  })

  it('rejects a wrong secret', () => {
    const header = buildHeader(PAYLOAD, SECRET, nowSeconds)
    expect(
      verifyWebhookSignature({ secret: 'whsec_other', payload: PAYLOAD, header, now }),
    ).toBe(false)
  })

  it('rejects a signature outside the tolerance window', () => {
    const stale = nowSeconds - 600
    const header = buildHeader(PAYLOAD, SECRET, stale)
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header, now, toleranceSeconds: 300 }),
    ).toBe(false)
  })

  it('accepts a stale signature when tolerance is widened', () => {
    const stale = nowSeconds - 600
    const header = buildHeader(PAYLOAD, SECRET, stale)
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header, now, toleranceSeconds: 900 }),
    ).toBe(true)
  })

  it('rejects a malformed header', () => {
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header: 'not-a-signature', now }),
    ).toBe(false)
  })

  it('rejects a header missing the v1 scheme', () => {
    expect(
      verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header: `t=${nowSeconds}`, now }),
    ).toBe(false)
  })

  it('rejects empty inputs', () => {
    const header = buildHeader(PAYLOAD, SECRET, nowSeconds)
    expect(verifyWebhookSignature({ secret: '', payload: PAYLOAD, header, now })).toBe(false)
    expect(verifyWebhookSignature({ secret: SECRET, payload: '', header, now })).toBe(false)
    expect(verifyWebhookSignature({ secret: SECRET, payload: PAYLOAD, header: '', now })).toBe(false)
  })
})

describe('webhook constants', () => {
  it('exposes the canonical header name', () => {
    expect(WEBHOOK_SIGNATURE_HEADER).toBe('X-RefCampaign-Signature')
  })

  it('exposes the five lifecycle event types', () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual([
      'conversion.created',
      'conversion.refunded',
      'conversion.commission_paid',
      'conversion.disputed',
      'conversion.dispute_resolved',
    ])
  })
})
