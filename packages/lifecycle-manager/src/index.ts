/**
 * Lifecycle Manager Package
 *
 * Provides lifecycle management functionality for Loopwork,
 * including heartbeat providers and health monitoring.
 *
 * This package implements the lifecycle contracts defined in
 * packages/contracts/src/lifecycle.ts.
 */

export type {
  HeartbeatConfig,
  HeartbeatEvent,
  HealthCheck,
  HealthCheckResult,
  HealthStatusChangeEvent,
  HealthMonitorConfig,
} from '@loopwork-ai/contracts'

export type {
  IHeartbeatProvider,
  IHealthMonitor,
} from '@loopwork-ai/contracts'
