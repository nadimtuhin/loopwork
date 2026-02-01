import { logger } from '../core/utils'

export interface CircuitBreakerConfig {
  maxFailures: number
  cooldownPeriodMs: number
  halfOpenAttempts: number
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerStats {
  state: CircuitBreakerState
  consecutiveFailures: number
  maxFailures: number
  cooldownPeriodMs: number
  lastFailureTime: number
  failureCount: number
  successCount: number
  halfOpenAttempts: number
  maxHalfOpenAttempts: number
}

export class CircuitBreaker {
  private consecutiveFailures: number = 0
  private failureCount: number = 0
  private successCount: number = 0
  private halfOpenAttempts: number = 0
  private state: CircuitBreakerState = 'closed'
  private lastFailureTime: number = 0
  private _isClosing: boolean = false

  constructor(
    private config: CircuitBreakerConfig
  ) {}

  async execute<T>(
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // Check if circuit breaker is open
    if (this.state === 'open') {
      if (!this._isClosing && Date.now() - this.lastFailureTime >= this.config.cooldownPeriodMs) {
        logger.debug(`[CircuitBreaker] ${name}: Transitioning to half-open after cooldown`)
        this.state = 'half-open'
        this.halfOpenAttempts = 0
      } else {
        throw new Error(`[CircuitBreaker] ${name}: Circuit breaker is OPEN (state: ${this.state})`)
      }
    }

    try {
      const result = await fn()
      this.recordSuccess(name)
      return result
    } catch (error) {
      this.recordFailure(name, error)
      throw error
    }
  }

  private recordSuccess(name: string): void {
    this.successCount++
    this.consecutiveFailures = 0

    if (this.state === 'half-open') {
      this.halfOpenAttempts++
      if (this.halfOpenAttempts >= this.config.halfOpenAttempts) {
        logger.info(`[CircuitBreaker] ${name}: Circuit breaker CLOSED after successful half-open attempts`)
        this.state = 'closed'
      }
    }
  }

  private recordFailure(name: string, _error: unknown): void {
    this.consecutiveFailures++
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === 'half-open') {
      logger.warn(`[CircuitBreaker] ${name}: Circuit breaker OPEN after half-open failure`)
      this.state = 'open'
      this.halfOpenAttempts = 0
    } else if (this.consecutiveFailures >= this.config.maxFailures) {
      logger.warn(`[CircuitBreaker] ${name}: Circuit breaker OPEN after ${this.consecutiveFailures} consecutive failures`)
      this.state = 'open'
    }
  }

  isOpen(): boolean {
    return this.state === 'open'
  }

  getState(): CircuitBreakerState {
    return this.state
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      maxFailures: this.config.maxFailures,
      cooldownPeriodMs: this.config.cooldownPeriodMs,
      lastFailureTime: this.lastFailureTime,
      failureCount: this.failureCount,
      successCount: this.successCount,
      halfOpenAttempts: this.halfOpenAttempts,
      maxHalfOpenAttempts: this.config.halfOpenAttempts
    }
  }

  reset(): void {
    this.consecutiveFailures = 0
    this.state = 'closed'
    this.halfOpenAttempts = 0
    logger.debug('[CircuitBreaker] Circuit breaker reset')
  }

  setConfig(config: CircuitBreakerConfig): void {
    this.config = config
    logger.debug(`[CircuitBreaker] Circuit breaker config updated: maxFailures=${config.maxFailures}, cooldown=${config.cooldownPeriodMs}ms`)
  }
}
