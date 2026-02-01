import {
  IResilienceEngine,
  RetryResult,
  ResilienceConfig,
  RetryAttempt
} from '@loopwork-ai/contracts'
import { ExponentialBackoff } from './backoff.js'
import { RateLimitBackoffStrategy } from './rate-limit.js'
import { StandardRetryStrategy, RetryOptions } from './retry.js'

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

    const exponentialBackoff = new ExponentialBackoff({
      baseDelayMs: opts.exponentialBackoffBaseDelay,
      maxDelayMs: opts.exponentialBackoffMaxDelay,
      multiplier: opts.exponentialBackoffMultiplier,
      jitter: opts.exponentialBackoffJitter,
    })

    const rateLimitBackoff = new RateLimitBackoffStrategy(
      opts.rateLimitWaitMs,
      exponentialBackoff,
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
    return { ...this.stats }
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
          result = await Promise.race([
            operation(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Operation timed out after ${attemptTimeout}ms`)), attemptTimeout)
            )
          ])
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
