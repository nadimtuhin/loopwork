/**
 * Lifecycle Contracts
 *
 * Defines core interfaces for managing system liveness and health monitoring.
 * These enable decoupled monitoring implementations (heartbeats, health checks)
 * from the core system components.
 */

/**
 * Configuration for heartbeat generation.
 */
export interface HeartbeatConfig {
  /**
   * Interval between heartbeats in milliseconds.
   * @default 30000 (30 seconds)
   */
  interval: number

  /**
   * Maximum number of consecutive missed heartbeats before considered dead.
   * @default 3
   */
  maxMissed: number

  /**
   * Optional data to include in each heartbeat payload.
   * Can include timestamp, sequence number, or custom metadata.
   */
  payload?: Record<string, unknown>

  /**
   * Whether to automatically restart if heartbeat fails.
   * @default false
   */
  autoRestart?: boolean

  /**
   * Retry interval in milliseconds if heartbeat fails.
   * @default 5000
   */
  retryInterval?: number
}

/**
 * Individual heartbeat event data.
 */
export interface HeartbeatEvent {
  /** Timestamp when heartbeat was sent */
  timestamp: Date

  /** Sequence number (monotonically increasing) */
  sequence: number

  /** Optional custom payload data */
  payload?: Record<string, unknown>

  /** Source identifier of the heartbeat */
  source: string
}

/**
 * Core interface for heartbeat providers.
 *
 * Heartbeat providers generate periodic "pulse" signals to indicate
 * aliveness. Used for liveness detection, connection keepalive,
 * and distributed coordination.
 */
export interface IHeartbeatProvider {
  /**
   * Unique identifier for this heartbeat provider.
   */
  readonly id: string

  /**
   * Human-readable name.
   */
  readonly name: string

  /**
   * Current heartbeat configuration.
   */
  readonly config: HeartbeatConfig

  /**
   * Whether heartbeat generation is currently active.
   */
  isActive: boolean

  /**
   * Number of heartbeats sent since start.
   */
  readonly totalBeats: number

  /**
   * Timestamp of the most recent heartbeat.
   */
  readonly lastBeat: Date | null

  /**
   * Start generating heartbeats.
   * Begins sending beats at the configured interval.
   * @throws Error if already active
   */
  start(): Promise<void>

  /**
   * Stop generating heartbeats.
   * Gracefully stops after current interval completes.
   */
  stop(): Promise<void>

  /**
   * Send a single heartbeat immediately.
   * Can be used for manual pings or testing.
   */
  beat(): Promise<HeartbeatEvent>

  /**
   * Reset heartbeat state.
   * Clears sequence counter and last beat timestamp.
   */
  reset(): void

  /**
   * Register event handlers.
   */
  on(event: 'beat', listener: (event: HeartbeatEvent) => void): this
  on(event: 'missed', listener: (sequence: number) => void): this
  on(event: 'stopped', listener: (reason: string) => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

/**
 * Result of an individual health check.
 */
export interface HealthCheck {
  /** Unique identifier for this check */
  name: string

  /** Whether this specific check passed */
  healthy: boolean

  /** Human-readable status message */
  message: string

  /** Time taken to execute this check */
  latencyMs: number

  /** Optional error details if check failed */
  error?: string

  /** Optional metadata for this check */
  metadata?: Record<string, unknown>
}

/**
 * Overall health check result.
 */
export interface HealthCheckResult {
  /** Overall system health status */
  healthy: boolean

  /** Individual check results */
  checks: HealthCheck[]

  /** Timestamp when check was performed */
  timestamp: Date

  /** Total latency for all checks */
  totalLatencyMs: number

  /** Optional metadata about the health check */
  metadata?: Record<string, unknown>

  /** Error message if overall health is degraded */
  error?: string
}

/**
 * Health status change event.
 */
export interface HealthStatusChangeEvent {
  /** New health status */
  status: 'healthy' | 'unhealthy'

  /** Previous health status */
  previousStatus: 'healthy' | 'unhealthy'

  /** Timestamp of status change */
  timestamp: Date

  /** Health check result that caused the change */
  result: HealthCheckResult

  /** Reason for the status change */
  reason: string
}

/**
 * Configuration for health monitoring.
 */
export interface HealthMonitorConfig {
  /**
   * Interval between automatic health checks in milliseconds.
   * @default 5000 (5 seconds)
   */
  checkInterval: number

  /**
   * Maximum acceptable latency for any single check in milliseconds.
   * Checks exceeding this threshold are marked unhealthy.
   * @default 5000
   */
  maxLatencyMs: number

  /**
   * Number of consecutive failures before marking system as unhealthy.
   * Prevents flapping due to transient failures.
   * @default 2
   */
  failureThreshold: number

  /**
   * Number of consecutive successes before marking system as healthy.
   * Prevents premature recovery declarations.
   * @default 1
   */
  recoveryThreshold: number

  /**
   * Whether to automatically start monitoring on initialization.
   * @default false
   */
  autoStart?: boolean

  /**
   * Names of health checks to include (empty = all checks).
   */
  includeChecks?: string[]

  /**
   * Names of health checks to exclude.
   */
  excludeChecks?: string[]

  /**
   * Timeout for individual health checks in milliseconds.
   * @default 10000
   */
  checkTimeout?: number
}

/**
 * Core interface for health monitoring.
 *
 * Health monitors perform periodic checks on system components
 * and aggregate results to determine overall system health.
 * Supports event-driven notifications for status changes.
 */
export interface IHealthMonitor {
  /**
   * Unique identifier for this health monitor.
   */
  readonly id: string

  /**
   * Human-readable name.
   */
  readonly name: string

  /**
   * Current health monitoring configuration.
   */
  readonly config: HealthMonitorConfig

  /**
   * Whether monitoring is currently active.
   */
  isMonitoring: boolean

  /**
   * Current overall health status.
   */
  readonly currentStatus: 'healthy' | 'unhealthy' | 'unknown'

  /**
   * Number of consecutive failures.
   */
  readonly consecutiveFailures: number

  /**
   * Number of consecutive successes.
   */
  readonly consecutiveSuccesses: number

  /**
   * Result of the most recent health check.
   */
  readonly lastResult: HealthCheckResult | null

  /**
   * Timestamp when status last changed.
   */
  readonly lastStatusChange: Date | null

  /**
   * Initialize the health monitor.
   * Called once before any monitoring operations.
   */
  initialize?(): Promise<void>

  /**
   * Cleanup resources before shutdown.
   */
  dispose?(): Promise<void>

  /**
   * Start periodic health monitoring.
   * Performs checks at the configured interval and emits events.
   */
  startMonitoring(): Promise<void>

  /**
   * Stop periodic health monitoring.
   */
  stopMonitoring(): Promise<void>

  /**
   * Perform a single health check immediately.
   * Does not affect periodic monitoring schedule.
   * @returns Health check result
   */
  checkHealth(): Promise<HealthCheckResult>

  /**
   * Register a health check to be performed.
   * @param name Unique identifier for this check
   * @param check Function that executes the health check
   */
  registerCheck(name: string, check: () => Promise<HealthCheck>): void

  /**
   * Unregister a health check.
   * @param name Name of the check to remove
   */
  unregisterCheck(name: string): void

  /**
   * Get all registered health check names.
   * @returns Array of check names
   */
  listChecks(): string[]

  /**
   * Update health monitor configuration.
   * Changes take effect on next check cycle.
   * @param config New configuration options
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void

  /**
   * Register event handlers.
   */
  on(event: 'statusChange', listener: (event: HealthStatusChangeEvent) => void): this
  on(event: 'healthy', listener: (result: HealthCheckResult) => void): this
  on(event: 'unhealthy', listener: (result: HealthCheckResult) => void): this
  on(event: 'check', listener: (result: HealthCheckResult) => void): this
  on(event: 'error', listener: (error: Error) => void): this
}
