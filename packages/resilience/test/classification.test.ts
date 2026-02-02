import { describe, expect, test } from 'bun:test'
import { classifyError, ResilienceErrorType, RateLimitError, QuotaExceededError } from '../src/backoff'

describe('Error Classification', () => {
  test('classifies rate limit errors', () => {
    expect(classifyError(new RateLimitError('Rate limit'))).toBe(ResilienceErrorType.RATE_LIMIT)
    expect(classifyError(new Error('429 Too Many Requests'))).toBe(ResilienceErrorType.RATE_LIMIT)
    expect(classifyError('rate limit exceeded')).toBe(ResilienceErrorType.RATE_LIMIT)
  })

  test('classifies quota exceeded errors', () => {
    expect(classifyError(new QuotaExceededError('Quota exceeded'))).toBe(ResilienceErrorType.QUOTA_EXCEEDED)
    expect(classifyError(new Error('billing limit reached'))).toBe(ResilienceErrorType.QUOTA_EXCEEDED)
    expect(classifyError('credit exhausted')).toBe(ResilienceErrorType.QUOTA_EXCEEDED)
    expect(classifyError(new Error('billing not enabled'))).toBe(ResilienceErrorType.QUOTA_EXCEEDED)
  })

  test('classifies transient errors', () => {
    expect(classifyError(new Error('ECONNRESET'))).toBe(ResilienceErrorType.TRANSIENT)
    expect(classifyError(new Error('Gateway Timeout'))).toBe(ResilienceErrorType.TRANSIENT)
    expect(classifyError({ code: 'ETIMEDOUT', message: 'fail' })).toBe(ResilienceErrorType.TRANSIENT)
    expect(classifyError('socket hang up')).toBe(ResilienceErrorType.TRANSIENT)
  })

  test('classifies unknown errors', () => {
    expect(classifyError(new Error('File not found'))).toBe(ResilienceErrorType.UNKNOWN)
    expect(classifyError('something went wrong')).toBe(ResilienceErrorType.UNKNOWN)
    expect(classifyError(null)).toBe(ResilienceErrorType.UNKNOWN)
  })
})
