/**
 * OpenTelemetry Telemetry Manager
 *
 * Provides distributed tracing and metrics instrumentation for Loopwork.
 * Uses OpenTelemetry SDK with OTLP exporters for production-grade observability.
 */

import { trace, metrics } from '@opentelemetry/api'
import { isRateLimitOutput } from '@loopwork-ai/resilience'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import { resourceFromAttributes, type Resource } from '@opentelemetry/resources'

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
  private provider: any | null = null
  private meterProvider: any | null = null
  private tracer: any | null = null
  private meter: any | null = null
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
    const resourceAttributes = {
      'service.name': config.serviceName ?? 'loopwork',
      'service.version': config.serviceVersion ?? '1.0.0',
      'service.namespace': 'loopwork',
      'service.type': 'ai-task-automation',
      'service.environment': process.env.NODE_ENV ?? 'development',
    }

    const resource = resourceFromAttributes(resourceAttributes)

    this.provider = new NodeTracerProvider({
      resource: resource as any,
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
        }) as any)
      )
    }

    this.provider.register()
    this.tracer = trace.getTracer('loopwork', '1.0.0')

    this.meterProvider = new MeterProvider({ resource: resource as any })

    if (config.metricsEndpoint) {
      this.meterProvider.addMetricExporter(
        new OTLPMetricExporter({
          url: config.metricsEndpoint,
          headers: config.headers,
        }) as any
      )
    }

    this.meter = metrics.getMeter('loopwork', '1.0.0')
    logger.info('OpenTelemetry telemetry initialized')
  }

  startTaskSpan(taskId: string, model: string, feature?: string, parentId?: string): any {
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

    return this.tracer.startSpan('task.execution', {
      attributes,
    })
  }

  startLoopSpan(namespace: string): any {
    if (!this.enabled || !this.tracer) {
      throw new Error('Telemetry is not enabled')
    }

    return this.tracer.startSpan('task.loop', {
      attributes: {
        'loop.namespace': namespace,
      },
    })
  }

  startCliSpan(cli: string, model: string, taskId: string): any {
    if (!this.enabled || !this.tracer) {
      throw new Error('Telemetry is not enabled')
    }

    const attributes: Record<string, string> = {
      'cli.type': cli,
      'cli.model': model,
      'task.id': taskId,
    }

    return this.tracer.startSpan('cli.execution', { attributes })
  }

  startToolSpan(toolName: string, taskId?: string, args?: Record<string, unknown>): any {
    if (!this.enabled || !this.tracer) {
      throw new Error('Telemetry is not enabled')
    }

    const attributes: Record<string, string> = {
      'tool.name': toolName,
    }

    if (taskId) {
      attributes['task.id'] = taskId
    }

    if (args) {
      // Record tool argument keys for context (not values to avoid leaking sensitive data)
      attributes['tool.args.keys'] = Object.keys(args).join(',')
    }

    return this.tracer.startSpan('tool.execution', { attributes })
  }

  recordToolExecution(toolName: string, durationMs: number, success: boolean, taskId?: string, error?: string): void {
    if (!this.enabled || !this.meter) {
      return
    }

    // Record tool execution duration histogram
    const durationHistogram = this.meter.createHistogram('tool.execution.duration', {
      description: 'Tool execution duration in milliseconds',
      unit: 'ms',
    })

    const tags: Record<string, string> = {
      tool_name: toolName,
      status: success ? 'success' : 'failed',
    }

    if (taskId) {
      tags.task_id = taskId
    }

    durationHistogram.record(durationMs, tags)

    // Record tool execution counter
    const counter = this.meter.createCounter('tool.execution.count', {
      description: 'Total tool execution count',
      unit: '1',
    })

    counter.add(1, tags)

    // Record errors if failed
    if (!success && error) {
      const errorCounter = this.meter.createCounter('tool.execution.errors', {
        description: 'Tool execution errors',
        unit: '1',
      })

      errorCounter.add(1, {
        ...tags,
        error_type: this.classifyError(error),
      })
    }
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
    if (isRateLimitOutput(lowerError)) return 'rate_limit'
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
