import { trace, type Span, type Attributes } from '@opentelemetry/api'
import type { LoopworkPlugin, TaskContext, LoopStats, ConfigWrapper, ToolCallEvent } from '../contracts'
import { TelemetryManager } from '../telemetry'
import { logger } from '../core/utils'

/**
 * Telemetry Plugin
 * 
 * Automatically records OpenTelemetry spans and metrics for task execution,
 * CLI invocations, and agent reasoning phases.
 */
export function createTelemetryPlugin(): LoopworkPlugin {
  const telemetry = TelemetryManager.getInstance()
  const taskSpans = new Map<string, Span>()
  const cliSpans = new Map<string, Span>()
  const reasoningSpans = new Map<string, Span>()
  let loopSpan: Span | null = null

  return {
    name: 'telemetry',

    async onLoopStart(namespace: string) {
      loopSpan = telemetry.startLoopSpan(namespace)
    },

    async onLoopEnd(stats: LoopStats) {
      if (loopSpan) {
        loopSpan.setAttributes({
          'loop.completed': stats.completed,
          'loop.failed': stats.failed,
          'loop.duration_ms': stats.duration * 1000,
        })
        loopSpan.end()
        loopSpan = null
      }
    },

    async onTaskStart(context: TaskContext) {
      const span = telemetry.startTaskSpan(
        context.task.id,
        context.model || (context.config as any).cli || 'unknown',
        context.task.feature,
        context.task.parentId
      )
      taskSpans.set(context.task.id, span)
    },

    async onTaskComplete(context: TaskContext, result: { duration: number; success: boolean }) {
      const span = taskSpans.get(context.task.id)
      if (span) {
        span.setAttributes({
          'task.duration_ms': result.duration * 1000,
          'task.success': result.success,
        })
        span.setStatus({ code: 1 }) // Ok
        span.end()
        taskSpans.delete(context.task.id)
      }
    },

    async onTaskFailed(context: TaskContext, error: string) {
      const span = taskSpans.get(context.task.id)
      if (span) {
        span.setAttributes({
          'task.success': false,
          'task.error': error,
        })
        span.setStatus({ code: 2, message: error }) // Error
        span.end()
        taskSpans.delete(context.task.id)
      }
    },

    // Handle CLI execution steps
    async onStep(step: { stepId: string; description: string; phase: 'start' | 'end'; context?: any }) {
      const taskId = step.context?.taskId || 'unknown'

      if (step.stepId === 'cli_execution_start' && step.phase === 'start') {
        const span = telemetry.startCliSpan(
          step.context?.cli || 'unknown',
          step.context?.model || 'unknown',
          taskId
        )
        cliSpans.set(taskId, span)
      } else if (step.stepId === 'cli_execution_end' && step.phase === 'end') {
        const span = cliSpans.get(taskId)
        if (span) {
          span.setAttributes({
            'cli.exit_code': step.context?.exitCode,
            'cli.duration_ms': step.context?.durationMs,
          })
          if (step.context?.exitCode === 0) {
            span.setStatus({ code: 1 })
          } else {
            span.setStatus({ code: 2, message: `CLI exited with code ${step.context?.exitCode}` })
          }
          span.end()
          cliSpans.delete(taskId)
        }
      } else if (step.stepId === 'agent_reasoning_start' && step.phase === 'start') {
        const tracer = trace.getTracer('loopwork', '1.0.0')
        const span = tracer.startSpan('agent.reasoning', {
          attributes: {
            'task.id': taskId,
            'model': step.context?.model,
          }
        })
        reasoningSpans.set(taskId, span)
      } else if (step.stepId === 'agent_reasoning_end' && step.phase === 'end') {
        const span = reasoningSpans.get(taskId)
        if (span) {
          span.setAttributes({
            'reasoning.duration_ms': step.context?.durationMs,
          })
          span.setStatus({ code: 1 })
          span.end()
          reasoningSpans.delete(taskId)
        }
      }
    },

    async onToolCall(event: ToolCallEvent) {
      const { toolName, taskId, timestamp, arguments: toolArgs } = event
      logger.debug(`Tool call: ${toolName}${taskId ? ` (task: ${taskId})` : ''} at ${timestamp} with args: ${Object.keys(toolArgs || {}).join(', ')}`)
    },
  }
}

/**
 * Add telemetry instrumentation to Loopwork
 */
export function withTelemetry(): ConfigWrapper {
  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), createTelemetryPlugin()],
  })
}
