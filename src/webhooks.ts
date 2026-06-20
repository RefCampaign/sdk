/**
 * Merchant-side helpers for the outbound RefCampaign webhooks.
 *
 * RefCampaign signs every webhook POST with HMAC-SHA256 and sends the
 * signature in the `X-RefCampaign-Signature` header, using the same scheme
 * as Stripe:
 *
 *   X-RefCampaign-Signature: t=<unix_seconds>,v1=<hex_sha256>
 *
 * where the signed payload is `${t}.${rawBody}`. Verify the signature on
 * your server before trusting the body — these helpers do exactly that.
 *
 * Server-only: this module uses Node's `crypto`. Import it from a backend
 * route (Next.js API route, Express handler, …), never from browser code.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const WEBHOOK_SIGNATURE_HEADER = 'X-RefCampaign-Signature'
const SIGNATURE_VERSION = 'v1'
const DEFAULT_TOLERANCE_SECONDS = 300

export const WEBHOOK_EVENT_TYPES = [
  'conversion.created',
  'conversion.refunded',
  'conversion.commission_paid',
  'conversion.disputed',
  'conversion.dispute_resolved',
] as const

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]

export interface VerifyWebhookSignatureOptions {
  /** The per-webhook signing secret (`whsec_…`) from your dashboard. */
  secret: string
  /** The raw request body, exactly as received (do not re-serialize). */
  payload: string
  /** The value of the `X-RefCampaign-Signature` header. */
  header: string
  /**
   * Max age of the signature in seconds, to reject replays. Defaults to 300
   * (5 minutes), matching Stripe's convention.
   */
  toleranceSeconds?: number
  /** Override the current time — for tests only. */
  now?: Date
}

interface ParsedSignatureHeader {
  timestamp: number
  signature: string
}

function parseSignatureHeader(header: string): ParsedSignatureHeader | null {
  let timestamp: number | null = null
  let signature: string | null = null

  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (key === 't' && value) {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) timestamp = parsed
    } else if (key === SIGNATURE_VERSION && value) {
      signature = value
    }
  }

  if (timestamp === null || signature === null) return null
  return { timestamp, signature }
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual throws on length mismatch, so guard first. The early
  // return leaks only the length, never the byte-by-byte comparison.
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify the authenticity and freshness of a RefCampaign webhook.
 *
 * @returns `true` if the signature is valid and within tolerance, else `false`.
 *
 * @example
 * import { verifyWebhookSignature, WEBHOOK_SIGNATURE_HEADER } from '@refcampaign/sdk'
 *
 * // Express
 * app.post('/webhooks/refcampaign', express.raw({ type: 'application/json' }), (req, res) => {
 *   const ok = verifyWebhookSignature({
 *     secret: process.env.REFCAMPAIGN_WEBHOOK_SECRET,
 *     payload: req.body.toString('utf8'),
 *     header: req.header(WEBHOOK_SIGNATURE_HEADER) ?? '',
 *   })
 *   if (!ok) return res.status(400).send('invalid signature')
 *   const event = JSON.parse(req.body.toString('utf8'))
 *   // … handle event.event / event.data
 *   res.sendStatus(200)
 * })
 */
export function verifyWebhookSignature(options: VerifyWebhookSignatureOptions): boolean {
  const {
    secret,
    payload,
    header,
    toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
    now = new Date(),
  } = options

  if (!secret || !payload || !header) return false

  const parsed = parseSignatureHeader(header)
  if (!parsed) return false

  const nowSeconds = Math.floor(now.getTime() / 1000)
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false

  const signedPayload = `${parsed.timestamp}.${payload}`
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')

  return constantTimeEquals(expected, parsed.signature)
}
