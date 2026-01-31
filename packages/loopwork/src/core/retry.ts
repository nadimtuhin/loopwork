/**
 * Retry Policy - Stub Implementation
 * Defines retry strategies for task execution
 */

export interface RetryPolicy {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors?: string[]
}

export type RetryPolicies = {
  [key: string]: RetryPolicy
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
  ],
}

export function isRetryableError(error: Error | string, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  const errorMsg = typeof error === 'string' ? error : error.message
  const retryableErrors = policy.retryableErrors || DEFAULT_RETRY_POLICY.retryableErrors || []
  return retryableErrors.some(pattern => errorMsg.includes(pattern))
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRetryPolicy(name?: string): RetryPolicy {
  // For now, just return the default policy
  // This can be extended to support named policies from a registry
  return DEFAULT_RETRY_POLICY
}

export function calculateBackoff(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const delay = policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt)
  return Math.min(delay, policy.maxDelay)
}
