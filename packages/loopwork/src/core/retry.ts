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

export function getRetryPolicy(task?: any, config?: any): RetryPolicy {
  // Priority: Task metadata > Config > Default
  const maxRetries = task?.metadata?.maxRetries ?? config?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries
  const initialDelay = task?.metadata?.retryDelay ?? config?.retryDelay ?? config?.taskDelay ?? DEFAULT_RETRY_POLICY.initialDelay
  const maxDelay = task?.metadata?.maxRetryDelay ?? config?.maxRetryDelay ?? DEFAULT_RETRY_POLICY.maxDelay
  
  return {
    ...DEFAULT_RETRY_POLICY,
    maxRetries: Number(maxRetries),
    initialDelay: Number(initialDelay),
    maxDelay: Number(maxDelay),
  }
}

export function calculateBackoff(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const delay = policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt)
  return Math.min(delay, policy.maxDelay)
}
