import type { IMetricsCollector } from '@loopwork-ai/contracts'

/**
 * Configuration options for ConsoleMetricsCollector
 */
export interface ConsoleMetricsCollectorConfig {
  /** Output stream for metrics (default: stdout) */
  outputStream?: NodeJS.WriteStream
  /** Error stream for errors (default: stderr) */
  errorStream?: NodeJS.WriteStream
  /** Prefix for all metric lines */
  prefix?: string
  /** Include timestamp in metric output */
  includeTimestamp?: boolean
  /** Date format for timestamp (ISO string by default) */
  timestampFormat?: 'iso' | 'unix'
}

/**
 * Console-based metrics collector implementation.
 * Writes metrics to stdout/stderr for logging and monitoring.
 */
export class ConsoleMetricsCollector implements IMetricsCollector {
  private outputStream: NodeJS.WriteStream
  private errorStream: NodeJS.WriteStream
  private prefix: string
  private includeTimestamp: boolean
  private timestampFormat: 'iso' | 'unix'

  constructor(config: ConsoleMetricsCollectorConfig = {}) {
    this.outputStream = config.outputStream ?? process.stdout
    this.errorStream = config.errorStream ?? process.stderr
    this.prefix = config.prefix ?? '[METRICS]'
    this.includeTimestamp = config.includeTimestamp ?? true
    this.timestampFormat = config.timestampFormat ?? 'iso'
  }

  /**
   * Get current timestamp based on configuration
   */
  private getTimestamp(): string {
    if (!this.includeTimestamp) return ''
    
    if (this.timestampFormat === 'unix') {
      return Date.now().toString()
    }
    return new Date().toISOString()
  }

  /**
   * Format tags object into a string
   */
  private formatTags(tags?: Record<string, string>): string {
    if (!tags || Object.keys(tags).length === 0) {
      return ''
    }
    
    const formatted = Object.entries(tags)
      .map(([key, value]) => {
        // Handle special characters in tag values
        const safeValue = value.includes(' ') || value.includes(',') || value.includes('=')
          ? `"${value.replace(/"/g, '\\"')}"`
          : value
        return `${key}=${safeValue}`
      })
      .join(',')
    
    return `{${formatted}}`
  }

  /**
   * Format a value, handling nested objects safely
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null'
    }
    
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '[Circular]'
      }
    }
    
    return String(value)
  }

  /**
   * Write a metric line to output
   */
  private writeMetric(
    type: string,
    name: string,
    value: number,
    tags?: Record<string, string>
  ): void {
    const timestamp = this.getTimestamp()
    const tagsStr = this.formatTags(tags)
    
    const parts = [this.prefix, type, name, value.toString()]
    if (timestamp) parts.unshift(timestamp)
    if (tagsStr) parts.push(tagsStr)
    
    const line = parts.join(' ') + '\n'
    
    // Use write for non-blocking output
    this.outputStream.write(line)
  }

  /**
   * Increment a counter metric
   * @param name - Metric name
   * @param value - Amount to increment (default: 1)
   * @param tags - Optional tags for categorization
   */
  increment(name: string, value?: number, tags?: Record<string, string>): void {
    const incrementValue = value ?? 1
    this.writeMetric('increment', name, incrementValue, tags)
  }

  /**
   * Decrement a counter metric
   * @param name - Metric name
   * @param value - Amount to decrement (default: 1)
   * @param tags - Optional tags for categorization
   */
  decrement(name: string, value?: number, tags?: Record<string, string>): void {
    const decrementValue = value ?? 1
    this.writeMetric('decrement', name, decrementValue, tags)
  }

  /**
   * Record a gauge metric (current value)
   * @param name - Metric name
   * @param value - Current value
   * @param tags - Optional tags for categorization
   */
  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.writeMetric('gauge', name, value, tags)
  }

  /**
   * Record a timing metric (duration in milliseconds)
   * @param name - Metric name
   * @param value - Duration in milliseconds
   * @param tags - Optional tags for categorization
   */
  timing(name: string, value: number, tags?: Record<string, string>): void {
    this.writeMetric('timing', name, value, tags)
  }

  /**
   * Flush any buffered metrics (no-op for console collector)
   */
  flush(): void {
    // Console output is immediate, no buffering to flush
  }
}

/**
 * Create a new ConsoleMetricsCollector with the given configuration
 */
export function createConsoleMetricsCollector(
  config?: ConsoleMetricsCollectorConfig
): ConsoleMetricsCollector {
  return new ConsoleMetricsCollector(config)
}
