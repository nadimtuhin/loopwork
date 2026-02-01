import { 
  isRetryable as isRetryableResilient, 
  calculateExponentialBackoff 
} from '@loopwork-ai/resilience'
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
  const err = typeof error === 'string' ? new Error(error) : error
  
  // If custom retryable errors are provided, strictly use those to match legacy behavior
  if (policy.retryableErrors && policy !== DEFAULT_RETRY_POLICY) {
    return isRetryableResilient(err, {
      retryOnTransient: false,
      retryOnRateLimit: false,
      retryableErrors: policy.retryableErrors
    })
  }

  return isRetryableResilient(err, {
    retryOnTransient: true,
    retryOnRateLimit: true,
    retryableErrors: policy.retryableErrors || DEFAULT_RETRY_POLICY.retryableErrors
  })
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
  if (policy.retryStrategy === 'exponential') {
    return calculateExponentialBackoff(attempt + 1, {
      baseDelayMs: policy.initialDelay,
      maxDelayMs: policy.maxDelay,
      multiplier: policy.backoffMultiplier,
      jitter: policy.jitter
    })
  } else {
    // Linear backoff logic
    const delay = policy.initialDelay * (attempt + 1)
    let finalDelay = delay

    if (policy.jitter) {
      const jitterFactor = 0.2 
      const randomFactor = 1 + (Math.random() * jitterFactor - (jitterFactor / 2))
      finalDelay = delay * randomFactor
    }

    return Math.min(Math.floor(finalDelay), policy.maxDelay)
  }
}
