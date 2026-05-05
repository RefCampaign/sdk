<p align="center">
  <a href="https://refcampaign.com">
    <img src="./assets/banner.png" alt="RefCampaign SDK" width="100%" />
  </a>
</p>

# RefCampaign SDK

Official JavaScript SDK for RefCampaign affiliate tracking.

Track affiliate conversions seamlessly with automatic session ID capture and Stripe metadata injection.

## Installation

```bash
pnpm add @refcampaign/sdk
# or
npm install @refcampaign/sdk
# or
yarn add @refcampaign/sdk
```

## Quick Start

### Browser Usage (React, Vue, vanilla JS)

Capture affiliate session IDs automatically from cookies, URL parameters, or localStorage.

```typescript
import { RefCampaignBrowser } from '@refcampaign/sdk'

// Capture session ID (call once on page load)
const { sessionId, source } = RefCampaignBrowser.captureSession()
console.log(`Session captured from ${source}:`, sessionId)

// Get session ID later
const currentSession = RefCampaignBrowser.getSessionId()
```

### Server Usage (Node.js, Next.js API routes)

Inject RefCampaign session ID into Stripe checkouts automatically.

```typescript
import { RefCampaignServer } from '@refcampaign/sdk'
import Stripe from 'stripe'

const rc = new RefCampaignServer('sk_prod_xyz789')
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

export async function POST(req: Request) {
  const { priceId } = await req.json()

  // Get session ID from request (e.g., from cookie or header)
  const sessionId = getSessionIdFromRequest(req)

  // Create Stripe checkout with RefCampaign metadata
  const checkout = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: rc.getStripeMetadata(sessionId), // ← Automatic conversion tracking!
    mode: 'payment',
    success_url: 'https://yoursite.com/success',
    cancel_url: 'https://yoursite.com/cancel',
  })

  return Response.json({ url: checkout.url })
}
```

## Stripe Metadata Strategy

### Where to Place RefCampaign Metadata

The placement of `refcampaign_session` metadata depends on your payment type:

#### One-time Payments

Place metadata on the **Payment Intent**:

```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: 2400,
  currency: 'eur',
  metadata: rc.getStripeMetadata(sessionId)  // ✅ On Payment Intent
})
```

**Why Payment Intent?**
- Payment Intent represents the one-time payment
- Metadata is automatically copied to the resulting Charge
- RefCampaign tracks the conversion when payment succeeds

#### Subscriptions (Recurring Payments)

Place metadata on the **Subscription** (NOT on Customer):

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: 'price_xxx' }],
  metadata: rc.getStripeMetadata(sessionId)  // ✅ On Subscription ONLY
})
```

**Why Subscription and not Customer?**
- Each subscription is tied to ONE specific affiliate campaign
- If a customer cancels and re-subscribes via a different link, the NEW affiliate gets credit
- Prevents attribution conflicts when customers have multiple subscriptions
- Fair commission attribution: affiliates earn only for THEIR subscription

#### Subscription Lifecycle Example

```
Month 1: Customer subscribes via Affiliate A link
→ Subscription created with refcampaign_session = "session_affiliateA"
→ Affiliate A earns initial commission ✅

Months 2-6: Subscription auto-renews monthly
→ Stripe charges customer automatically
→ RefCampaign finds "session_affiliateA" in subscription.metadata
→ Affiliate A earns recurring commission each month ✅

Month 7: Customer cancels subscription
→ No more recurring charges or commissions

6 months later: Customer re-subscribes via Affiliate B link
→ NEW subscription created with refcampaign_session = "session_affiliateB"
→ Affiliate B earns commission (not Affiliate A) ✅
→ Future renewals credit Affiliate B
```

**Important Notes:**
- Stripe automatically copies `checkout.session.metadata` to the created subscription
- You don't need to manually set subscription metadata when using Checkout Sessions
- For server-side subscription creation, explicitly set metadata on the subscription object

## Complete Examples

### Next.js App Router (Full Flow)

**1. Browser-side: Capture session ID**

```typescript
// app/layout.tsx
'use client'

import { useEffect } from 'react'
import { RefCampaignBrowser } from '@refcampaign/sdk'

export default function RootLayout({ children }) {
  useEffect(() => {
    // Capture session ID on page load
    const result = RefCampaignBrowser.captureSession()

    if (result.sessionId) {
      console.log('[RefCampaign] Session tracked:', result.sessionId)
    }
  }, [])

  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
```

**2. Server-side: Create Stripe checkout**

```typescript
// app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { RefCampaignServer } from '@refcampaign/sdk'
import Stripe from 'stripe'

const rc = new RefCampaignServer(process.env.REFCAMPAIGN_SECRET_KEY!)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    // Get session ID from cookie
    const sessionId = req.cookies.get('_rc_sid')?.value

    // Get price from request
    const { priceId } = await req.json()

    // Create Stripe checkout
    const checkout = await stripe.checkout.sessions.create({
      line_items: [{ price: priceId, quantity: 1 }],

      // ✅ Required: Session metadata (automatically copied to subscription)
      metadata: rc.getStripeMetadata(sessionId),

      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    })

    return NextResponse.json({ url: checkout.url })
  } catch (error) {
    console.error('[Checkout] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout' },
      { status: 500 }
    )
  }
}
```

**3. Webhook: Automatic conversion tracking**

RefCampaign automatically tracks conversions via Stripe webhooks when it detects the `refcampaign_session` metadata. No additional code needed!

---

### React SPA + Express Backend

**Frontend (React)**

```typescript
// src/App.tsx
import { useEffect } from 'react'
import { RefCampaignBrowser } from '@refcampaign/sdk'

function App() {
  useEffect(() => {
    RefCampaignBrowser.captureSession()
  }, [])

  async function handleCheckout() {
    // Session ID is already captured and stored
    const sessionId = RefCampaignBrowser.getSessionId()

    // Send to backend
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_xxx',
        sessionId // Pass session ID explicitly
      }),
    })

    const { url } = await response.json()
    window.location.href = url
  }

  return <button onClick={handleCheckout}>Subscribe</button>
}
```

**Backend (Express)**

```typescript
// server.ts
import express from 'express'
import Stripe from 'stripe'
import { RefCampaignServer } from '@refcampaign/sdk'

const app = express()
const rc = new RefCampaignServer(process.env.REFCAMPAIGN_SECRET_KEY)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

app.post('/api/checkout', async (req, res) => {
  const { priceId, sessionId } = req.body

  const checkout = await stripe.checkout.sessions.create({
    line_items: [{ price: priceId, quantity: 1 }],

    // Session metadata (automatically copied to subscription)
    metadata: rc.getStripeMetadata(sessionId),

    mode: 'subscription',
    success_url: 'https://yoursite.com/success',
    cancel_url: 'https://yoursite.com/cancel',
  })

  res.json({ url: checkout.url })
})

app.listen(3000)
```

---

## Manual Conversion Tracking

For non-Stripe conversions (PayPal, bank transfer, etc.), use manual tracking:

```typescript
import { RefCampaignServer } from '@refcampaign/sdk'

const rc = new RefCampaignServer('sk_prod_xyz789')

async function handlePayPalPayment(sessionId: string, amount: number) {
  // Track conversion manually
  const result = await rc.trackConversion({
    sessionId,
    amount: 4999, // Amount in cents (€49.99)
    currency: 'EUR',
    metadata: {
      payment_method: 'paypal',
      plan: 'pro',
    },
  })

  if (result.success) {
    console.log('Conversion tracked:', result.conversionId)
  } else {
    console.error('Failed to track conversion:', result.error)
  }
}
```

---

## Email Hash Fallback (Cross-Device Attribution)

Cookies and localStorage disappear in Safari (Intelligent Tracking Prevention erases them after 7 days), in incognito sessions, with ad-blockers, and across devices. When that happens, sessionId-based attribution drops to 0 and the conversion is lost.

`RefCampaignBrowser.identify(email)` solves this by attaching a SHA-256 hash of the customer's email to the current click row. At conversion time, RefCampaign falls back to matching by email hash when the sessionId is gone — automatic for Stripe payments, and via the manual `trackConversion` endpoint for everything else.

### Usage

Call `identify()` right after you know the user's email — login, signup, or profile update:

```typescript
import { RefCampaignBrowser } from '@refcampaign/sdk'

// After successful login or signup
RefCampaignBrowser.identify(currentUser.email)
```

That's it. Fire-and-forget, no return value to handle. The call is silent if no active click is in progress (no cookie, no localStorage), and silent if the email hash already exists for this session (first-write-wins).

### When to call

- **After login** — for returning users
- **After signup** — for new users at the moment of account creation
- **After profile update** — if the user changes their email
- Safe to call **multiple times** in the same session: the server keeps the first hash and ignores subsequent writes (anti-transplant defense).

### Privacy

The email is hashed **client-side via Web Crypto SHA-256** before any network call — the raw email never leaves the browser. This mirrors the standard pseudo-anonymization used by Meta CAPI, Google Conversions API, and similar attribution systems.

The hash is stored against the click row only and is automatically deleted with the click after 30 days (GDPR retention).

### Configuring for staging or self-hosted deployments

By default the SDK calls `https://app.refcampaign.com`. Override it for staging or self-hosted setups:

```typescript
RefCampaignBrowser.configure({ apiBase: 'https://app.test.refcampaign.com' })
RefCampaignBrowser.identify(currentUser.email)
```

### How it improves attribution

| Scenario | Without `identify()` | With `identify()` |
|---|---|---|
| Cookie + same device | ✅ Matched via sessionId | ✅ Matched via sessionId |
| Safari ITP, 8+ days later | ❌ Conversion lost | ✅ Matched via emailHash |
| User clicks on phone, pays on desktop | ❌ Conversion lost | ✅ Matched via emailHash |
| Incognito + payment | ❌ Conversion lost | ✅ Matched via emailHash |

---

## Error Handling

### Common Error Scenarios

#### 1. Invalid Session ID

```typescript
import { RefCampaignServer } from '@refcampaign/sdk'

const rc = new RefCampaignServer(process.env.REFCAMPAIGN_SECRET_KEY!)

try {
  const result = await rc.trackConversion({
    sessionId: 'invalid', // Too short (< 10 chars)
    amount: 4999,
    currency: 'EUR'
  })
} catch (error) {
  console.error('Conversion tracking failed:', error.message)
  // Error: "sessionId must be at least 10 characters long"
}
```

#### 2. Stripe Checkout Creation Failure

```typescript
export async function POST(req: NextRequest) {
  try {
    const sessionId = req.cookies.get('_rc_sid')?.value

    if (!sessionId) {
      throw new Error('No affiliate session found')
    }

    const checkout = await stripe.checkout.sessions.create({
      // ... checkout config
    })

    return NextResponse.json({ url: checkout.url })
  } catch (error) {
    console.error('[Checkout Error]', error)

    return NextResponse.json(
      {
        error: 'Checkout creation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
```

#### 3. Manual Conversion API Failure

```typescript
async function trackPayPalPayment(sessionId: string, amount: number) {
  try {
    const result = await rc.trackConversion({
      sessionId,
      amount,
      currency: 'EUR',
      metadata: { payment_method: 'paypal' }
    })

    if (result.success) {
      console.log('✅ Conversion tracked:', result.conversionId)
    } else {
      console.error('❌ Tracking failed:', result.error)
      // Handle business logic for failed tracking
    }
  } catch (error) {
    console.error('🔥 API Error:', error)

    // Retry logic (example)
    setTimeout(() => {
      console.log('Retrying conversion tracking...')
      trackPayPalPayment(sessionId, amount)
    }, 5000)
  }
}
```

#### 4. Missing Subscription Metadata for Recurring

If recurring commissions aren't working, check the subscription metadata:

```typescript
// Debug: Check if subscription has affiliate attribution
const subscription = await stripe.subscriptions.retrieve('sub_subscription_id', {
  expand: ['latest_invoice']
})

if (!subscription.metadata?.refcampaign_session) {
  console.warn('⚠️ Subscription missing RefCampaign attribution metadata')
  console.log('Available metadata:', subscription.metadata)

  // Note: Cannot retroactively add metadata to existing subscriptions
  // You need to ensure metadata is set during subscription creation
  console.error('Action required: Recreate subscription with proper metadata')
}
```

### Error Handling Best Practices

1. **Always validate session ID before API calls**
2. **Implement retry logic for temporary API failures**
3. **Log errors with context for debugging**
4. **Gracefully degrade when tracking fails** (don't break user flow)
5. **Monitor webhook failures** (RefCampaign retries 5x automatically)

---

## API Reference

### `RefCampaignBrowser`

Browser-side API for capturing session IDs.

#### Methods

##### `captureSession(): SessionCaptureResult`

Capture session ID from URL, cookie, or localStorage.

Priority order:
1. URL parameter (`?_rcid=xxx`)
2. Cookie (`_rc_sid`)
3. localStorage (`_rc_sid`)

```typescript
const { sessionId, source } = RefCampaignBrowser.captureSession()
console.log(`Captured from ${source}:`, sessionId)
```

##### `getSessionId(): string | null`

Get current session ID from localStorage.

```typescript
const sessionId = RefCampaignBrowser.getSessionId()
```

##### `identify(email: string): Promise<void>`

Attach a SHA-256 hash of the user's email to the current click row, enabling email-hash fallback attribution when cookies and localStorage are gone (Safari ITP, cross-device, incognito).

The email is hashed client-side via Web Crypto and the raw value never leaves the browser. Fire-and-forget: silent if no session is active, silent on network errors, idempotent (first-write-wins on the server).

Call this right after you know the user's email — typically post-login or post-signup. Fire-and-forget, no need to await.

```typescript
// After successful login or signup
RefCampaignBrowser.identify(currentUser.email)
```

##### `configure(options: { apiBase?: string }): void`

Override the RefCampaign API base URL. Defaults to production (`https://app.refcampaign.com`). Used for staging or self-hosted deployments. Trailing slashes are stripped.

```typescript
RefCampaignBrowser.configure({ apiBase: 'https://app.test.refcampaign.com' })
```

---

### `RefCampaignServer`

Server-side API for Stripe metadata injection and conversion tracking.

#### Constructor

```typescript
new RefCampaignServer(secretKey: string, config?: {
  apiUrl?: string // Default: 'https://app.refcampaign.com'
  debug?: boolean // Default: false
})
```

#### Methods

##### `getStripeMetadata(sessionId?: string): StripeMetadata`

Get Stripe metadata with RefCampaign session ID.

```typescript
const metadata = rc.getStripeMetadata('abc123')
// Returns: { refcampaign_session: 'abc123' }
```

##### `trackConversion(data: ConversionData): Promise<TrackConversionResponse>`

Track conversion manually (for non-Stripe payments).

```typescript
const result = await rc.trackConversion({
  sessionId: 'abc123',
  amount: 4999, // cents
  currency: 'EUR',
  metadata: { plan: 'pro' } // optional
})
```

---

## TypeScript Types

```typescript

interface RefCampaignServerConfig {
  secretKey: string // Starts with 'sk_'
  apiUrl?: string
  debug?: boolean
}

interface SessionCaptureResult {
  sessionId: string | null
  source: 'url' | 'cookie' | 'localStorage' | 'none'
}

interface ConversionData {
  sessionId: string // Required - minimum 10 characters, alphanumeric + dash/underscore
  amount: number // Amount in cents (integer)
  currency: string // ISO 4217 code (e.g., 'EUR', 'USD')
  metadata?: Record<string, any>
}

interface StripeMetadata {
  refcampaign_session?: string
}
```

---

## How It Works

### One-time Payments

1. **User clicks affiliate link**: `https://track.refcampaign.com/AFFILIATE_CODE`
2. **Tracking worker sets cookie**: `_rc_sid` with 90-day expiration
3. **User lands on your site**: SDK captures session ID
4. **User makes payment**: Stripe metadata includes `refcampaign_session`
5. **Webhook triggers**: Stripe sends `checkout.session.completed`
6. **Queue processing**: Conversion queued to Redis, processed within 10 minutes
7. **Commission calculated**: Affiliate earns commission

### Recurring Subscriptions

1. **Steps 1-4 same as above**: Initial conversion with subscription metadata
2. **Monthly renewal**: Stripe sends `invoice.paid` webhook
3. **Attribution lookup**: RefCampaign reads subscription metadata via invoice for affiliate info
4. **Recurring commission**: New commission created automatically
5. **Affiliate notification**: Email sent about recurring commission

**Note:** Each subscription maintains its own RefCampaign metadata. If a customer cancels and later re-subscribes via a different affiliate link, the new subscription will credit the new affiliate.

### Processing Architecture

- **Immediate**: Webhook received and queued to Redis
- **Async processing**: Background job runs every 10 minutes
- **Retry logic**: Failed conversions retried up to 5 times
- **Delay tolerance**: Conversions may take up to 10 minutes to appear in dashboard

---

## Environment Variables

```bash
# Secret key (server-side only, NEVER expose in browser)
REFCAMPAIGN_SECRET_KEY=your-secret-key-here
```

---

## License

MIT

---

## Support

Need help? Contact us at contact@refcampaign.com
