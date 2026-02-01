/**
 * Circuit Breaker for Model Failures
 *
 * Implements the circuit breaker pattern to temporarily disable models
 * that are experiencing repeated failures. Prevents wasting time on
 * broken models and allows them to recover.
 */

export interface CircuitBreakerOptions {
  failureThreshold: number
  resetTimeoutMs: number
  halfOpenMaxCalls: number
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  failures: number
  successes: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
  totalCalls: number
  totalFailures: number
}

type CircuitBreakerListener = (state: CircuitBreakerState) => void

export class CircuitBreaker {
  private options: Required<CircuitBreakerOptions>
  private state: CircuitBreakerState
  private halfOpenCalls = 0
  private listeners: CircuitBreakerListener[] = []

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 3,
      resetTimeoutMs: options.resetTimeoutMs ?? 600000, // 10 minutes (model sleep duration)
      halfOpenMaxCalls: options.halfOpenMaxCalls ?? 3,
    }

    this.state = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalCalls: 0,
      totalFailures: 0,
    }
  }

  /**
   * Check if the circuit allows calls
   */
  canExecute(): boolean {
    this.transitionIfNeeded()
    
    if (this.state.state === 'open') {
      return false
    }

    if (this.state.state === 'half-open') {
      return this.halfOpenCalls < this.options.halfOpenMaxCalls
    }

    return true
  }

  /**
   * Record a successful call
   */
  recordSuccess(): void {
    this.state.totalCalls++
    this.state.successes++
    this.state.lastSuccessTime = Date.now()

    if (this.state.state === 'half-open') {
      // Success in half-open state closes the circuit immediately
      this.close()
    } else if (this.state.state === 'closed') {
      // Reset failure count on success in closed state
      if (this.state.failures > 0) {
        this.state.failures = Math.max(0, this.state.failures - 1)
      }
    }

    this.notifyListeners()
  }

  /**
   * Record a failed call
   * Returns true if the circuit just opened
   */
  recordFailure(): boolean {
    this.state.totalCalls++
    this.state.totalFailures++
    this.state.failures++
    this.state.lastFailureTime = Date.now()

    const justOpened = this.state.state !== 'open' && 
                       this.state.failures >= this.options.failureThreshold

    if (this.state.state === 'half-open') {
      // Failure in half-open state immediately opens circuit
      this.open()
    } else if (this.state.state === 'closed' && justOpened) {
      // Threshold reached, open the circuit
      this.open()
    }

    this.notifyListeners()
    return justOpened
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    this.transitionIfNeeded()
    return { ...this.state }
  }

  /**
   * Check if circuit is open (failing)
   */
  isOpen(): boolean {
    this.transitionIfNeeded()
    return this.state.state === 'open'
  }

  /**
   * Check if circuit is closed (healthy)
   */
  isClosed(): boolean {
    this.transitionIfNeeded()
    return this.state.state === 'closed'
  }

  /**
   * Manually open the circuit
   */
  open(): void {
    if (this.state.state !== 'open') {
      this.state.state = 'open'
      this.halfOpenCalls = 0
      this.notifyListeners()
    }
  }

  /**
   * Manually close the circuit
   */
  close(): void {
    this.state.state = 'closed'
    this.state.failures = 0
    this.halfOpenCalls = 0
    this.notifyListeners()
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.state = {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailureTime: null,
      lastSuccessTime: null,
      totalCalls: 0,
      totalFailures: 0,
    }
    this.halfOpenCalls = 0
    this.notifyListeners()
  }

  /**
   * Get time until circuit might close (for logging)
   */
  getTimeUntilReset(): number {
    if (this.state.state !== 'open' || !this.state.lastFailureTime) {
      return 0
    }
    const elapsed = Date.now() - this.state.lastFailureTime
    return Math.max(0, this.options.resetTimeoutMs - elapsed)
  }

  /**
   * Get human-readable time until reset
   */
  getTimeUntilResetText(): string {
    const ms = this.getTimeUntilReset()
    if (ms === 0) return 'soon'
    
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(listener: CircuitBreakerListener): () => void {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /**
   * Check and transition state if needed
   */
  private transitionIfNeeded(): void {
    if (this.state.state === 'open' && this.state.lastFailureTime) {
      const elapsed = Date.now() - this.state.lastFailureTime
      if (elapsed >= this.options.resetTimeoutMs) {
        // Transition to half-open to test if service recovered
        this.state.state = 'half-open'
        this.halfOpenCalls = 0
        this.notifyListeners()
      }
    }
  }

  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach((listener) => {
      try {
        listener(state)
      } catch {
        // Ignore listener errors
      }
    })
  }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>()
  private defaultOptions: Partial<CircuitBreakerOptions>

  constructor(defaultOptions: Partial<CircuitBreakerOptions> = {}) {
    this.defaultOptions = defaultOptions
  }

  /**
   * Get or create a circuit breaker for a model
   */
  get(modelName: string): CircuitBreaker {
    if (!this.breakers.has(modelName)) {
      this.breakers.set(modelName, new CircuitBreaker(this.defaultOptions))
    }
    return this.breakers.get(modelName)!
  }

  /**
   * Check if a model can execute
   */
  canExecute(modelName: string): boolean {
    return this.get(modelName).canExecute()
  }

  /**
   * Record success for a model
   */
  recordSuccess(modelName: string): void {
    this.get(modelName).recordSuccess()
  }

  /**
   * Record failure for a model
   */
  recordFailure(modelName: string): boolean {
    return this.get(modelName).recordFailure()
  }

  /**
   * Get all breaker states
   */
  getAllStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>()
    for (const [name, breaker] of this.breakers) {
      states.set(name, breaker.getState())
    }
    return states
  }

  /**
   * Get names of all open circuits
   */
  getOpenCircuits(): string[] {
    const open: string[] = []
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen()) {
        open.push(name)
      }
    }
    return open
  }

  /**
   * Reset all breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }

  /**
   * Reset a specific breaker
   */
  reset(modelName: string): void {
    if (this.breakers.has(modelName)) {
      this.breakers.get(modelName)!.reset()
    }
  }

  /**
   * Clear all breakers
   */
  clear(): void {
    this.breakers.clear()
  }
}
