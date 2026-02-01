import {
  IRetryStrategy,
  IResilienceEngine,
  RetryResult,
  ResilienceConfig,
  RetryAttempt,
  IBackoffPolicy
} from '@loopwork-ai/contracts'
import { 
  ExponentialBackoff, 
  ConstantBackoff, 
  RateLimitBackoffStrategy,
  DEFAULT_RATE_LIMIT_WAIT_MS,
  isRateLimitError,
  isRateLimitOutput,
  isOpenCodeCacheCorruption,
  RateLimitError,
  RetryableError
} from './backoff'

/**
 * Options for the standard retry strategy
 */
export interface RetryOptions {
  /** Maximum number of attempts (including initial) */
  maxAttempts: number
  /** Whether to retry on rate limit errors (default: true) */
  retryOnRateLimit?: boolean
  /** Whether to retry on transient errors (default: true) */
  retryOnTransient?: boolean
  /** Whether to retry on all errors (default: false) */
  retryOnAllErrors?: boolean
  /** Custom error message patterns to retry on */
  retryableErrors?: string[]
  /** Wait time when rate limit is detected (default: 30000ms) */
  rateLimitWaitMs?: number
  /** Optional delay strategy function */
  delayStrategy?: (attempt: number) => number
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 3,
  retryOnRateLimit: true,
  retryOnTransient: true,
  retryOnAllErrors: false,
  rateLimitWaitMs: DEFAULT_RATE_LIMIT_WAIT_MS,
}

/**
 * Checks if an error is retryable based on the provided options
 */
export function isRetryable(
  error: unknown,
  options: Partial<RetryOptions>,
): boolean {
  const {
    retryOnRateLimit,
    retryOnTransient,
    retryOnAllErrors,
    retryableErrors,
  } = options

  if (!error) {
    return false
  }

  if (retryOnAllErrors) {
    return true
  }

  const err = error as Record<string, unknown>
  const errorMessage = (typeof error === 'string' ? error : String(err.message || '')).toLowerCase()
  const errorCode = typeof error === 'object' && error !== null && 'code' in err ? String(err.code).toLowerCase() : undefined

  if (retryableErrors && retryableErrors.length > 0) {
    if (retryableErrors.some((pattern: string) => errorMessage.includes(pattern.toLowerCase()))) {
      return true
    }
    if (errorCode && retryableErrors.some((pattern: string) => errorCode === pattern.toLowerCase())) {
      return true
    }
  }

  if (isRateLimitError(error)) {
    return retryOnRateLimit ?? true
  }

  if (retryOnTransient) {
    const transientErrors = [
      'econnreset',
      'etimeout',
      'connection refused',
      'connection reset',
      'network error',
      'network unreachable',
      'enotfound',
      'socket hang up',
      'internal server error',
      '500',
      '502',
      '503',
      '504',
      'eai_again',
      'econnrefused',
      'etimedout',
      '408',
      'gateway timeout',
      'bad gateway',
      'service unavailable',
      'timeout', // Generic timeout
    ]

    const isTransientMessage = transientErrors.some((transient) => errorMessage.includes(transient))
    const isTransientCode = errorCode && transientErrors.some((transient) => errorCode === transient)

    return Boolean(isTransientMessage || isTransientCode)
  }

  return false
}

/**
 * Standard Retry Strategy
 *
 * Implements IRetryStrategy interface with support for rate limits,
 * transient errors, and configurable max attempts.
 */
export class StandardRetryStrategy implements IRetryStrategy {
  constructor(private options: RetryOptions) {}

  getMaxAttempts(): number {
    return this.options.maxAttempts
  }

  /**
   * Determines if the operation should be retried based on current attempt
   * and the error that occurred.
   */
  shouldRetry(attempt: number, error: Error): boolean {
    if (attempt >= this.options.maxAttempts) {
      return false
    }

    return isRetryable(error, this.options)
  }
}

/**
 * Factory function to create a standard retry strategy
 */
export function standardRetry(options: RetryOptions): StandardRetryStrategy {
  return new StandardRetryStrategy(options)
}

export interface ResilienceRunnerOptions {
  maxAttempts: number
  retryOnRateLimit?: boolean
  retryOnTransient?: boolean
  retryOnAllErrors?: boolean
  retryableErrors?: string[]
  rateLimitWaitMs?: number
  exponentialBackoff?: boolean
  exponentialBackoffBaseDelay?: number
  exponentialBackoffMaxDelay?: number
  exponentialBackoffMultiplier?: number
  exponentialBackoffJitter?: boolean
}

export const DEFAULT_RESILIENCE_OPTIONS: ResilienceRunnerOptions = {
  maxAttempts: 3,
  retryOnRateLimit: true,
  retryOnTransient: true,
  retryOnAllErrors: false,
  rateLimitWaitMs: 30000,
  exponentialBackoff: true,
  exponentialBackoffBaseDelay: 1000,
  exponentialBackoffMaxDelay: 60000,
  exponentialBackoffMultiplier: 2,
  exponentialBackoffJitter: true,
}

export class ResilienceRunner implements IResilienceEngine {
  private options: Required<ResilienceRunnerOptions>
  private defaultConfig: ResilienceConfig
  private stats = {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    totalAttempts: 0,
    averageAttemptsPerOperation: 0,
  }

  constructor(options: Partial<ResilienceRunnerOptions> = {}) {
    this.options = {
      maxAttempts: options.maxAttempts ?? DEFAULT_RESILIENCE_OPTIONS.maxAttempts,
      retryOnRateLimit: options.retryOnRateLimit ?? DEFAULT_RESILIENCE_OPTIONS.retryOnRateLimit ?? true,
      retryOnTransient: options.retryOnTransient ?? DEFAULT_RESILIENCE_OPTIONS.retryOnTransient ?? true,
      retryOnAllErrors: options.retryOnAllErrors ?? DEFAULT_RESILIENCE_OPTIONS.retryOnAllErrors ?? false,
      retryableErrors: options.retryableErrors ?? [],
      rateLimitWaitMs: options.rateLimitWaitMs ?? DEFAULT_RESILIENCE_OPTIONS.rateLimitWaitMs ?? 30000,
      exponentialBackoff: options.exponentialBackoff ?? DEFAULT_RESILIENCE_OPTIONS.exponentialBackoff ?? true,
      exponentialBackoffBaseDelay: options.exponentialBackoffBaseDelay ?? DEFAULT_RESILIENCE_OPTIONS.exponentialBackoffBaseDelay ?? 1000,
      exponentialBackoffMaxDelay: options.exponentialBackoffMaxDelay ?? DEFAULT_RESILIENCE_OPTIONS.exponentialBackoffMaxDelay ?? 60000,
      exponentialBackoffMultiplier: options.exponentialBackoffMultiplier ?? DEFAULT_RESILIENCE_OPTIONS.exponentialBackoffMultiplier ?? 2,
      exponentialBackoffJitter: options.exponentialBackoffJitter ?? DEFAULT_RESILIENCE_OPTIONS.exponentialBackoffJitter ?? true,
    }

    this.defaultConfig = this.buildConfig()
  }

  private buildConfig(options?: Partial<ResilienceRunnerOptions>): ResilienceConfig {
    const opts = options ? { ...this.options, ...options } : this.options
    const retryOptions: RetryOptions = {
      maxAttempts: opts.maxAttempts,
      retryOnRateLimit: opts.retryOnRateLimit,
      retryOnTransient: opts.retryOnTransient,
      retryOnAllErrors: opts.retryOnAllErrors,
      retryableErrors: opts.retryableErrors,
      rateLimitWaitMs: opts.rateLimitWaitMs,
    }

    let backoffPolicy: IBackoffPolicy

    if (opts.exponentialBackoff) {
      backoffPolicy = new ExponentialBackoff({
        baseDelayMs: opts.exponentialBackoffBaseDelay,
        maxDelayMs: opts.exponentialBackoffMaxDelay,
        multiplier: opts.exponentialBackoffMultiplier,
        jitter: opts.exponentialBackoffJitter,
      })
    } else {
      backoffPolicy = new ConstantBackoff(opts.exponentialBackoffBaseDelay)
    }

    const rateLimitBackoff = new RateLimitBackoffStrategy(
      opts.rateLimitWaitMs,
      backoffPolicy,
    )

    return {
      retryStrategy: new StandardRetryStrategy(retryOptions),
      backoffPolicy: rateLimitBackoff,
      rateLimitWaitMs: opts.rateLimitWaitMs,
    }
  }

  setDefaultConfig(config: Partial<ResilienceConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config }
  }

  getDefaultConfig(): ResilienceConfig {
    return this.defaultConfig
  }

  resetStats(): void {
    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalAttempts: 0,
      averageAttemptsPerOperation: 0,
    }
  }

  getStats() {
    return { ... this.stats }
  }

  /**
   * Convenience static method to run an operation with resilience.
   * Creates a new ResilienceRunner instance for each call.
   */
  static async run<T>(
    operation: () => Promise<T>,
    options?: Partial<ResilienceRunnerOptions>,
    config?: Partial<ResilienceConfig>
  ): Promise<T> {
    return new ResilienceRunner(options).run(operation)
  }

  async execute<T>(

    operation: () => Promise<T>,
    config?: Partial<ResilienceConfig>
  ): Promise<RetryResult<T>> {
    const activeConfig = config ? { ...this.defaultConfig, ...config } : this.defaultConfig
    const { 
      retryStrategy, 
      backoffPolicy, 
      onRetry, 
      onComplete, 
      attemptTimeout 
    } = activeConfig
    
    this.stats.totalOperations++
    const attemptHistory: RetryAttempt[] = []
    const startTime = Date.now()
    
    let attempt = 0
    let lastError: Error | undefined
    
    while (attempt < retryStrategy.getMaxAttempts()) {
      attempt++
      this.stats.totalAttempts++
      
      let currentDelay = 0
      
      if (attempt > 1) {
        currentDelay = backoffPolicy.calculateDelay(attempt - 1, lastError)

        if (onRetry && lastError) {
          onRetry(attempt, lastError, currentDelay)
        }

        await new Promise(resolve => setTimeout(resolve, currentDelay))
      }

      try {
        let result: T
        if (attemptTimeout && attemptTimeout > 0) {
          let timeoutHandle: any
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error(`Operation timed out after ${attemptTimeout}ms`)), attemptTimeout)
          })
          
          try {
            result = await Promise.race([operation(), timeoutPromise])
          } finally {
            clearTimeout(timeoutHandle)
          }
        } else {
          result = await operation()
        }
        
        const retryAttempt: RetryAttempt = {
          attempt,
          success: true,
          delay: currentDelay,
          timestamp: new Date(),
        }
        attemptHistory.push(retryAttempt)
        
        this.stats.successfulOperations++
        this.updateAverageAttempts()
        
        const finalResult: RetryResult<T> = {
          success: true,
          attempts: attempt,
          totalDuration: Date.now() - startTime,
          result,
          attemptHistory,
        }

        if (onComplete) {
          onComplete(finalResult)
        }
        
        return finalResult
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        const retryAttempt: RetryAttempt = {
          attempt,
          success: false,
          delay: currentDelay,
          error: lastError,
          timestamp: new Date(),
        }
        attemptHistory.push(retryAttempt)

        if (!retryStrategy.shouldRetry(attempt, lastError)) {
          break
        }
      }
    }

    this.stats.failedOperations++
    this.updateAverageAttempts()

    const finalResult: RetryResult<T> = {
      success: false,
      attempts: attempt,
      totalDuration: Date.now() - startTime,
      attemptHistory,
      finalError: lastError,
    }

    if (onComplete) {
      onComplete(finalResult)
    }

    return finalResult
  }

  async executeSync<T>(
    operation: () => T,
    config?: Partial<ResilienceConfig>
  ): Promise<RetryResult<T>> {
    return this.execute(async () => operation(), config)
  }

  private updateAverageAttempts(): void {
    this.stats.averageAttemptsPerOperation = 
      this.stats.totalAttempts / this.stats.totalOperations
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const result = await this.execute(fn)
    if (result.success) {
      return result.result as T
    }
    throw result.finalError || new Error('Resilience execution failed')
  }

  getRateLimitWaitMs(): number {
    return this.options.rateLimitWaitMs
  }
}

export function createResilienceRunner(options?: Partial<ResilienceRunnerOptions>): ResilienceRunner {
  return new ResilienceRunner(options)
}

export function makeResilient<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options?: Partial<ResilienceRunnerOptions>,
): T {
  const runner = new ResilienceRunner(options)
  return ((...args: Parameters<T>) => runner.run(() => fn(...args))) as T
}
