import { describe, it, expect } from 'vitest'
import {
  validateSecretKey,
  validateSessionId,
  validateCurrency,
  validateAmount,
} from '../utils/validation'

describe('validateSecretKey', () => {
  it('should accept valid secret keys', () => {
    expect(validateSecretKey('sk_test_abc123')).toBe(true)
    expect(validateSecretKey('sk_prod_xyz789')).toBe(true)
    expect(validateSecretKey('sk_1234567890')).toBe(true)
  })

  it('should reject invalid secret keys', () => {
    expect(validateSecretKey('pk_test_abc')).toBe(false)
    expect(validateSecretKey('sk_short')).toBe(false)
    expect(validateSecretKey('sk_')).toBe(false)
    expect(validateSecretKey('')).toBe(false)
    expect(validateSecretKey('invalid')).toBe(false)
  })
})

describe('validateSessionId', () => {
  it('should accept valid UUID v4 session IDs', () => {
    expect(validateSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    // Note: The function also accepts UUID v1 because it matches alphanumeric pattern
    expect(validateSessionId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('should accept alphanumeric session IDs', () => {
    expect(validateSessionId('abc123def456')).toBe(true)
    expect(validateSessionId('session_id_12345')).toBe(true)
    expect(validateSessionId('abcd-efgh-1234')).toBe(true)
  })

  it('should reject invalid session IDs', () => {
    expect(validateSessionId('')).toBe(false)
    expect(validateSessionId('short')).toBe(false)
    expect(validateSessionId('abc')).toBe(false)
    expect(validateSessionId('invalid@session')).toBe(false)
  })
})

describe('validateCurrency', () => {
  it('should accept valid ISO 4217 currency codes', () => {
    expect(validateCurrency('EUR')).toBe(true)
    expect(validateCurrency('USD')).toBe(true)
    expect(validateCurrency('GBP')).toBe(true)
    expect(validateCurrency('JPY')).toBe(true)
  })

  it('should reject invalid currency codes', () => {
    expect(validateCurrency('eur')).toBe(false)
    expect(validateCurrency('US')).toBe(false)
    expect(validateCurrency('EURO')).toBe(false)
    expect(validateCurrency('')).toBe(false)
    expect(validateCurrency('123')).toBe(false)
  })
})

describe('validateAmount', () => {
  it('should accept valid amounts', () => {
    expect(validateAmount(100)).toBe(true)
    expect(validateAmount(4999)).toBe(true)
    expect(validateAmount(1)).toBe(true)
    expect(validateAmount(999999)).toBe(true)
  })

  it('should reject invalid amounts', () => {
    expect(validateAmount(0)).toBe(false)
    expect(validateAmount(-100)).toBe(false)
    expect(validateAmount(49.99)).toBe(false)
    expect(validateAmount(NaN)).toBe(false)
  })
})
