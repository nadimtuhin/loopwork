/**
 * OpenTelemetry Telemetry Manager
 *
 * Provides distributed tracing and metrics instrumentation for Loopwork.
 * Uses OpenTelemetry SDK with OTLP exporters for production-grade observability.
 */

import { trace, metrics } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { Resource } from '@opentelemetry/resources'
import type { ResourceAttributes } from '@opentelemetry/resources'

export interface TelemetryConfig {
  enabled?: boolean
  tracesEndpoint?: string
  metricsEndpoint?: string
  serviceName?: string
  serviceVersion?: string
  headers?: Record<string, string>
  traceSampleRate?: number
  consoleLogs?: boolean
}

export class TelemetryManager {
  private static instance: TelemetryManager | null = null
  private provider: NodeTracerProvider | null = null
  private meterProvider: MeterProvider | null = null
  private tracer: trace.Tracer | null = null
  private meter: unknown | null = null
  private enabled: boolean

  private constructor(config: TelemetryConfig) {
    this.enabled = config.enabled ?? true
    if (!this.enabled) {
      logger.warn('Telemetry is disabled')
      return
    }
    try {
      this.initialize(config)
    } catch (error) {
      logger.error('Failed to initialize telemetry:', error)
      this.enabled = false
    }
  }

  static getInstance(config?: TelemetryConfig): TelemetryManager {
    if (!TelemetryManager.instance) {
      TelemetryManager.instance = new TelemetryManager(config ?? {})
    }
    return TelemetryManager.instance
  }

  /**
   * Reset the singleton instance (for testing)
   * @internal
   */
  static resetInstance(): void {
    if (TelemetryManager.instance) {
      TelemetryManager.instance.shutdown()
    }
    TelemetryManager.instance = null
  }

  private initialize(config: TelemetryConfig): void {
    const resourceAttributes: ResourceAttributes = {
      'service.name': config.serviceName ?? 'loopwork',
      'service.version': config.serviceVersion ?? '1.0.0',
      'service.namespace': 'loopwork',
      'service.type': 'ai-task-automation',
      'service.environment': process.env.NODE_ENV ?? 'development',
    }

    const resource = new Resource(resourceAttributes)

    this.provider = new NodeTracerProvider({
      resource,
    })

    if (config.consoleLogs) {
      this.provider.addSpanProcessor(
        new BatchSpanProcessor(new ConsoleSpanExporter())
      )
    }

    if (config.tracesEndpoint) {
      this.provider.addSpanProcessor(
        new BatchSpanProcessor(new OTLPMetricExporter({
          url: config.tracesEndpoint,
          headers: config.headers,
        }))
      )
    }

    this.provider.register()
    this.tracer = trace.getTracer('loopwork', '1.0.0')

    this.meterProvider = new MeterProvider({ resource })

    if (config.metricsEndpoint) {
      this.meterProvider.addMetricExporter(
        new OTLPMetricExporter({
          url: config.metricsEndpoint,
          headers: config.headers,
        })
      )
    }

    this.meter = metrics.getMeter('loopwork', '1.0.0')
    logger.info('OpenTelemetry telemetry initialized')
  }

  startTaskSpan(taskId: string, model: string, feature?: string, parentId?: string): trace.Span {
    if (!this.enabled || !this.tracer) {
      throw new Error('Telemetry is not enabled')
    }

    const attributes: Record<string, string> = {
      'task.id': taskId,
      'task.model': model,
    }

    if (feature) {
      attributes['task.feature'] = feature
    }

    if (parentId) {
      attributes['task.parent_id'] = parentId
    }

    return this.tracer.startSpan('task.execution', attributes, {
      parent: parentId ? trace.getSpanContext(parentId) : undefined,
    })
  }

  startCliSpan(cli: string, model: string, taskId: string): trace.Span {
    if (!this.enabled || !this.tracer) {
      throw new Error('Telemetry is not enabled')
    }

    const attributes: Record<string, string> = {
      'cli.type': cli,
      'cli.model': model,
      'task.id': taskId,
    }

    return this.tracer.startSpan('cli.execution', attributes)
  }

  recordTokenUsage(taskId: string, model: string, inputTokens: number, outputTokens: number, cost: number, durationSeconds: number, status: 'success' | 'failed', error?: string): void {
    if (!this.enabled || !this.meter) {
      return
    }

    const counter = this.meter.createCounter('ai.tokens.total', {
      description: 'Total tokens used by AI models',
      unit: '1',
    })

    const tags: Record<string, string> = {
      task_id: taskId,
      model: model,
      status: status,
    }

    counter.add(inputTokens + outputTokens, {
      ...tags,
      'token.type': 'input',
    })

    counter.add(inputTokens + outputTokens, {
      ...tags,
      'token.type': 'output',
    })

    const costCounter = this.meter.createCounter('ai.tokens.cost', {
      description: 'Token usage cost in USD',
      unit: 'USD',
    })

    costCounter.add(cost, tags)

    const histogram = this.meter.createHistogram('ai.tokens.per_second', {
      description: 'Tokens processed per second',
      unit: 'tokens/s',
    })

    if (durationSeconds > 0) {
      const tokensPerSecond = (inputTokens + outputTokens) / durationSeconds
      histogram.record(tokensPerSecond, {
        ...tags,
        'token.type': 'total',
      })
    }

    if (status === 'failed' && error) {
      const errorCounter = this.meter.createCounter('ai.errors.total', {
        description: 'Total errors encountered',
        unit: '1',
      })

      errorCounter.add(1, {
        ...tags,
        error_type: this.classifyError(error),
      })
    }
  }

  recordTaskDuration(taskId: string, durationMs: number, status: 'success' | 'failed', model?: string): void {
    if (!this.enabled || !this.meter) {
      return
    }

    const histogram = this.meter.createHistogram('task.duration', {
      description: 'Task execution duration in milliseconds',
      unit: 'ms',
    })

    const tags: Record<string, string> = {
      task_id: taskId,
      status: status,
      ...(model && { model: model }),
    }

    histogram.record(durationMs, tags)
  }

  private classifyError(error: string): string {
    const lowerError = error.toLowerCase()

    if (lowerError.includes('timeout')) return 'timeout'
    if (lowerError.includes('rate limit') || lowerError.includes('429')) return 'rate_limit'
    if (lowerError.includes('connection') || lowerError.includes('network')) return 'connection_error'
    if (lowerError.includes('api key') || lowerError.includes('authentication')) return 'authentication_error'
    if (lowerError.includes('validation') || lowerError.includes('invalid')) return 'validation_error'

    return 'other'
  }

  recordTaskCompletion(taskId: string, model: string, durationMs: number, inputTokens: number, outputTokens: number, cost: number, success: boolean, error?: string): void {
    const durationSeconds = durationMs / 1000

    this.recordTaskDuration(taskId, durationMs, success ? 'success' : 'failed', model)
    this.recordTokenUsage(taskId, model, inputTokens, outputTokens, cost, durationSeconds, success ? 'success' : 'failed', error)
  }

  async flush(): Promise<void> {
    if (!this.provider || !this.meterProvider) {
      return
    }

    await this.provider.shutdown()
    await this.meterProvider.shutdown()
    logger.info('Telemetry flushed')
  }

  shutdown(): void {
    if (this.provider) {
      this.provider.shutdown().catch(() => {})
    }
    if (this.meterProvider) {
      this.meterProvider.shutdown().catch(() => {})
    }
  }
}

interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

let logger: Logger = {
  info: (...args: unknown[]) => console.log('[Telemetry]', ...args),
  warn: (...args: unknown[]) => console.warn('[Telemetry]', ...args),
  error: (...args: unknown[]) => console.error('[Telemetry]', ...args),
}

export function setTestLogger(testLogger: Logger): void {
  logger = testLogger
}

export function getDefaultConfig(): TelemetryConfig {
  return {
    enabled: true,
    consoleLogs: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
  }
}

export function createTelemetryManager(config?: TelemetryConfig): TelemetryManager {
  return TelemetryManager.getInstance(config)
}
