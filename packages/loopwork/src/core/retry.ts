/**
 * Retry Policy
 * Defines retry strategies for task execution
 */

import type { Task } from '../contracts/types'

export interface RetryPolicy {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoffMultiplier: number
  retryableErrors?: string[]
  jitter?: boolean
  retryStrategy?: 'linear' | 'exponential'
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
    'Rate limit',
    '429',
    '500',
    '502',
    '503',
    '504'
  ],
  jitter: true,
  retryStrategy: 'exponential'
}

export function isRetryableError(error: Error | string, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  const errorMsg = typeof error === 'string' ? error : error.message
  const errorCode = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined
  
  const retryableErrors = policy.retryableErrors || DEFAULT_RETRY_POLICY.retryableErrors || []
  
  if (retryableErrors.some(pattern => errorMsg.includes(pattern))) {
    return true
  }
  
  if (errorCode && retryableErrors.some(pattern => errorCode === pattern)) {
    return true
  }
  
  return false
}

export function getRetryPolicy(task?: Task | null, config?: Partial<Record<string, unknown>>): RetryPolicy {
  const maxRetries = (task?.metadata?.maxRetries as number) ?? config?.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries
  const initialDelay = (task?.metadata?.retryDelay as number) ?? config?.retryDelay ?? config?.taskDelay ?? DEFAULT_RETRY_POLICY.initialDelay
  const maxDelay = (task?.metadata?.maxRetryDelay as number) ?? config?.maxRetryDelay ?? DEFAULT_RETRY_POLICY.maxDelay
  const backoffMultiplier = (task?.metadata?.backoffMultiplier as number) ?? config?.backoffMultiplier ?? DEFAULT_RETRY_POLICY.backoffMultiplier
  const jitter = (task?.metadata?.jitter as boolean) ?? config?.jitter ?? DEFAULT_RETRY_POLICY.jitter
  const retryStrategy = (task?.metadata?.retryStrategy as 'linear' | 'exponential') ?? config?.retryStrategy ?? DEFAULT_RETRY_POLICY.retryStrategy

  return {
    ...DEFAULT_RETRY_POLICY,
    maxRetries: Number(maxRetries),
    initialDelay: Number(initialDelay),
    maxDelay: Number(maxDelay),
    backoffMultiplier: Number(backoffMultiplier),
    jitter: Boolean(jitter),
    retryStrategy: retryStrategy
  }
}

export function calculateBackoff(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  let delay = policy.initialDelay

  if (policy.retryStrategy === 'exponential') {
    delay = policy.initialDelay * Math.pow(policy.backoffMultiplier, attempt)
  } else {
    delay = policy.initialDelay * (attempt + 1)
  }

  if (policy.jitter) {
    const jitterFactor = 0.2 
    const randomFactor = 1 + (Math.random() * jitterFactor - (jitterFactor / 2))
    delay = delay * randomFactor
  }

  return Math.min(Math.floor(delay), policy.maxDelay)
}
