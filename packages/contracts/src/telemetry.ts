import { LogLevel } from './logger'

/**
 * Structured log entry for telemetry
 */
export interface StructuredLog {
  level: LogLevel
  message: string
  timestamp: string
  metadata?: Record<string, unknown>
  error?: Error | string
  namespace?: string
  taskId?: string
  iteration?: number
}

/**
 * Metrics collector for tracking system performance and usage
 */
export interface IMetricsCollector {
  increment(name: string, value?: number, tags?: Record<string, string>): void
  decrement(name: string, value?: number, tags?: Record<string, string>): void
  gauge(name: string, value: number, tags?: Record<string, string>): void
  timing(name: string, value: number, tags?: Record<string, string>): void
}

/**
 * Telemetry provider that coordinates logging and metrics
 */
export interface ITelemetryProvider {
  log(entry: StructuredLog): void
  metrics: IMetricsCollector
  flush?(): Promise<void>
}
