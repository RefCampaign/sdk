/**
 * Validation utilities for RefCampaign SDK
 */


/**
 * Validate secret API key format (must start with sk_)
 */
export function validateSecretKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith('sk_') && key.length > 10
}

/**
 * Validate session ID format (UUID v4 or similar)
 */
export function validateSessionId(sessionId: string): boolean {
  if (!sessionId || typeof sessionId !== 'string') return false

  // Allow UUID v4 format or any alphanumeric string longer than 8 chars
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const alphanumericRegex = /^[a-zA-Z0-9_-]{8,}$/

  return uuidRegex.test(sessionId) || alphanumericRegex.test(sessionId)
}

/**
 * Validate currency code (ISO 4217)
 */
export function validateCurrency(currency: string): boolean {
  if (!currency || typeof currency !== 'string') return false

  // ISO 4217 currency codes are 3 uppercase letters
  return /^[A-Z]{3}$/.test(currency)
}

/**
 * Validate amount (must be positive integer in cents)
 */
export function validateAmount(amount: number): boolean {
  return typeof amount === 'number' && amount > 0 && Number.isInteger(amount)
}
