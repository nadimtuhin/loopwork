/**
 * Resilience Contracts
 *
 * Defines retry strategies, backoff policies, and execution wrapper
 * for fail-safe operations with automatic retry logic.
 */

/**
 * Result of a retry attempt
 */
export interface RetryAttempt {
  /** Attempt number (1-indexed) */
  attempt: number

  /** Whether the attempt succeeded */
  success: boolean

  /** Delay before this attempt in milliseconds */
  delay: number

  /** Error if attempt failed */
  error?: Error

  /** Timestamp when attempt was made */
  timestamp: Date
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether any attempt succeeded */
  success: boolean

  /** Number of attempts made */
  attempts: number

  /** Total time spent including delays */
  totalDuration: number

  /** The successful result (if any) */
  result?: T

  /** All attempts with their outcomes */
  attemptHistory: RetryAttempt[]

  /** Final error if all attempts failed */
  finalError?: Error
}

/**
 * Retry Strategy Interface
 *
 * Determines if and when to retry operations.
 */
export interface IRetryStrategy {
  /**
   * Check if operation should be retried
   * @param attempt - Current attempt number (1-indexed)
   * @param error - Error from failed attempt
   * @returns True if should retry, false to stop
   */
  shouldRetry(attempt: number, error: Error): boolean

  /**
   * Get maximum number of retry attempts
   */
  getMaxAttempts(): number
}

/**
 * Backoff Policy Interface
 *
 * Calculates delay between retry attempts.
 */
export interface IBackoffPolicy {
  /**
   * Calculate delay before next attempt
   * @param attempt - Attempt number to calculate delay for (1-indexed)
   * @param error - Optional error from the failed attempt (for error-aware backoff strategies)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number, error?: Error): number

  /**
   * Get initial/base delay for this policy
   */
  getBaseDelay(): number
}

/**
 * Resilience Configuration
 *
 * Combines retry strategy and backoff policy.
 */
export interface ResilienceConfig {
  /**
   * Retry strategy to determine when to retry
   */
  retryStrategy: IRetryStrategy

  /**
   * Backoff policy to calculate delays between retries
   */
  backoffPolicy: IBackoffPolicy

  /**
   * Optional timeout for individual attempts
   */
  attemptTimeout?: number

  /**
   * Wait time when rate limit is detected (milliseconds)
   * @default 30000
   */
  rateLimitWaitMs?: number

  /**
   * Optional callback before each retry attempt
   */
  onRetry?: (attempt: number, error: Error, delay: number) => void

  /**
   * Optional callback after operation completes (success or failure)
   */
  onComplete?: (result: RetryResult<any>) => void
}

/**
 * Resilience Engine Interface
 *
 * Execution wrapper for fail-safe operations with automatic retry logic.
 * Combines retry strategies and backoff policies for resilient execution.
 */
export interface IResilienceEngine {
  /**
   * Execute an operation with retry and backoff logic
   * @template T - Return type of the operation
   * @param operation - The function to execute with retry logic
   * @param config - Resilience configuration (uses default if not provided)
   * @returns Promise resolving to the retry result
   *
   * @example
   * ```ts
   * const result = await engine.execute(
   *   async () => {
   *     const response = await fetch('https://api.example.com/data')
   *     return response.json()
   *   },
   *   {
   *     retryStrategy: new MaxAttemptsStrategy(3),
   *     backoffPolicy: new ExponentialBackoffPolicy(1000)
   *   }
   * )
   *
   * if (result.success) {
   *   console.log('Got data:', result.result)
   * } else {
   *   console.error('Failed after', result.attempts, 'attempts')
   * }
   * ```
   */
  execute<T>(
    operation: () => Promise<T>,
    config?: Partial<ResilienceConfig>
  ): Promise<RetryResult<T>>

  /**
   * Execute a synchronous operation with retry and backoff logic
   * @template T - Return type of the operation
   * @param operation - The function to execute with retry logic
   * @param config - Resilience configuration (uses default if not provided)
   * @returns Promise resolving to the retry result
   *
   * @example
   * ```ts
   * const result = await engine.executeSync(
   *   () => readFile('data.json', 'utf-8'),
   *   {
   *     retryStrategy: new MaxAttemptsStrategy(2),
   *     backoffPolicy: new FixedBackoffPolicy(500)
   *   }
   * )
   * ```
   */
  executeSync<T>(
    operation: () => T,
    config?: Partial<ResilienceConfig>
  ): Promise<RetryResult<T>>

  /**
   * Update the default resilience configuration
   * @param config - New configuration to apply as default
   */
  setDefaultConfig(config: Partial<ResilienceConfig>): void

  /**
   * Get the current default resilience configuration
   */
  getDefaultConfig(): ResilienceConfig

  /**
   * Reset statistics (attempt counts, success rates, etc.)
   */
  resetStats(): void

  /**
   * Get execution statistics
   */
  getStats(): {
    totalOperations: number
    successfulOperations: number
    failedOperations: number
    totalAttempts: number
    averageAttemptsPerOperation: number
  }
}
