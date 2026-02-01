/**
 * Audit Logging Plugin
 *
 * Comprehensive audit logging for Loopwork task execution
 * Tracks all lifecycle events with timestamps and context
 */

import type { LoopworkPlugin, TaskContext, PluginTaskResult, LoopStats, StepEvent, ToolCallEvent, AgentResponseEvent, ConfigWrapper } from '@loopwork-ai/loopwork/contracts'
import type { Task } from '@loopwork-ai/loopwork/contracts'
import { logger } from '@loopwork-ai/common'
import fs from 'fs'
import path from 'path'

export interface AuditEvent {
  id: string
  timestamp: string
  eventType: 'task_start' | 'task_complete' | 'task_failed' | 'loop_start' | 'loop_end' | 'plugin_hook' | 'step_event' | 'tool_call' | 'agent_response'
  taskId?: string
  taskTitle?: string
  namespace: string
  iteration?: number
  data: {
    duration?: number
    description?: string
    status?: string
    priority?: string
    feature?: string
    error?: string
    success?: boolean
    output?: string
    pluginName?: string
    hookName?: string
    stepId?: string
    stepDescription?: string
    stepPhase?: 'start' | 'end'
    toolName?: string
    toolArguments?: Record<string, unknown>
    responseText?: string
    model?: string
    isPartial?: boolean
    metadata?: Record<string, unknown>
  }
}

export interface AuditConfig {
  enabled?: boolean
  auditDir?: string
  maxFileSizeMb?: number
  maxFiles?: number
  eventTypes?: AuditEvent['eventType'][]
  includeDescriptions?: boolean
  compressOldLogs?: boolean
}

export class AuditLogManager {
  private auditDir: string
  private currentLogFile: string | null = null
  private currentEvents: AuditEvent[] = []
  private maxFileSize: number
  private maxFiles: number

  constructor(auditDir: string, maxFileSizeMb: number = 10, maxFiles: number = 100) {
    this.auditDir = auditDir
    this.maxFileSize = maxFileSizeMb * 1024 * 1024
    this.maxFiles = maxFiles

    if (!fs.existsSync(auditDir)) {
      fs.mkdirSync(auditDir, { recursive: true })
      logger.success(`Created audit directory: ${auditDir}`)
    }
  }

  private getCurrentLogFile(sessionId: string): string {
    return path.join(this.auditDir, `${sessionId}.jsonl`)
  }

  writeEvent(event: AuditEvent, sessionId: string): void {
    const logFile = this.getCurrentLogFile(sessionId)
    const logLine = JSON.stringify(event) + '\n'

    try {
      fs.appendFileSync(logFile, logLine, 'utf8')
    } catch (error) {
      logger.error(`Failed to write audit event: ${error}`)
    }
  }

  flush(sessionId: string): void {
    if (this.currentEvents.length === 0) return

    for (const event of this.currentEvents) {
      this.writeEvent(event, sessionId)
    }

    this.currentEvents = []
  }

  shouldRotateFile(sessionId: string): boolean {
    const logFile = this.getCurrentLogFile(sessionId)
    if (!fs.existsSync(logFile)) return false

    const stats = fs.statSync(logFile)
    return stats.size > this.maxFileSize
  }

  getAuditFiles(): string[] {
    if (!fs.existsSync(this.auditDir)) return []

    const files = fs.readdirSync(this.auditDir)
    return files
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(this.auditDir, f))
      .sort((a, b) => {
        const statA = fs.statSync(a)
        const statB = fs.statSync(b)
        return statB.mtimeMs - statA.mtimeMs
      })
  }

  rotateLogs(): void {
    const files = this.getAuditFiles()

    if (files.length <= this.maxFiles) return

    const filesToRemove = files.slice(this.maxFiles)
    for (const file of filesToRemove) {
      try {
        fs.unlinkSync(file)
        logger.debug(`Removed old audit log: ${file}`)
      } catch (error) {
        logger.warn(`Failed to remove old audit log ${file}: ${error}`)
      }
    }
  }

  cleanupOldLogs(daysToKeep: number = 30): void {
    const files = this.getAuditFiles()
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)

    for (const file of files) {
      const stats = fs.statSync(file)
      if (stats.mtimeMs < cutoffTime) {
        try {
          fs.unlinkSync(file)
          logger.debug(`Removed old audit log: ${file}`)
        } catch (error) {
          logger.warn(`Failed to remove old audit log ${file}: ${error}`)
        }
      }
    }
  }
}

export function createAuditLoggingPlugin(config: AuditConfig = {}): LoopworkPlugin {
  const {
    enabled = true,
    auditDir = '.loopwork/audit/',
    maxFileSizeMb = 10,
    maxFiles = 100,
    eventTypes,
    includeDescriptions = true,
    compressOldLogs = false,
  } = config

  const auditManager = new AuditLogManager(auditDir, maxFileSizeMb, maxFiles)

  const generateEventId = (): string => {
    return `audit_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  const shouldLogEvent = (eventType: AuditEvent['eventType']): boolean => {
    if (!enabled) return false
    if (!eventTypes) return true
    return eventTypes.includes(eventType)
  }

  const extractTaskData = (task: Task): Record<string, unknown> => {
    const data: Record<string, unknown> = {}

    if (task.title) data.taskTitle = task.title
    if (task.description && includeDescriptions) data.description = task.description
    if (task.status) data.status = task.status
    if (task.priority) data.priority = task.priority
    if (task.metadata?.feature) data.feature = task.metadata.feature

    return data
  }

  const sessionId = `session_${Date.now()}`
  let currentNamespace = 'default'

  return {
    name: 'audit-logging',
    classification: 'enhancement',

    async onConfigLoad(loopworkConfig) {
      auditManager.rotateLogs()

      return loopworkConfig
    },

    async onLoopStart(namespace) {
      currentNamespace = namespace
      if (!shouldLogEvent('loop_start')) return

      const event: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'loop_start',
        namespace,
        data: {
          metadata: {
            sessionId,
          },
        },
      }

      auditManager.writeEvent(event, sessionId)
      logger.debug(`[AUDIT] Loop started: ${namespace}`)
    },

    async onLoopEnd(stats: LoopStats) {
      if (!shouldLogEvent('loop_end')) return

      const event: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'loop_end',
        namespace: currentNamespace,
        data: {
          metadata: {
            sessionId,
            completed: stats.completed,
            failed: stats.failed,
            duration: stats.duration,
            isDegraded: stats.isDegraded,
            disabledPlugins: stats.disabledPlugins,
          },
        },
      }

      auditManager.writeEvent(event, sessionId)
      auditManager.flush(sessionId)

      auditManager.rotateLogs()
      auditManager.cleanupOldLogs()

      logger.debug(`[AUDIT] Loop ended - completed: ${stats.completed}, failed: ${stats.failed}`)
    },

    async onTaskStart(context: TaskContext) {
      if (!shouldLogEvent('task_start')) return

      const taskData = extractTaskData(context.task)

      const event: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'task_start',
        taskId: context.task.id,
        taskTitle: context.task.title,
        namespace: context.namespace,
        iteration: context.iteration,
        data: {
          ...taskData,
          metadata: {
            sessionId,
            startTime: context.startTime.toISOString(),
          },
        },
      }

      auditManager.writeEvent(event, sessionId)
      logger.debug(`[AUDIT] Task started: ${context.task.id}`)
    },

    async onTaskComplete(context: TaskContext, result: PluginTaskResult) {
      if (!shouldLogEvent('task_complete')) return

      const taskData = extractTaskData(context.task)

      const event: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'task_complete',
        taskId: context.task.id,
        taskTitle: context.task.title,
        namespace: context.namespace,
        iteration: context.iteration,
        data: {
          ...taskData,
          duration: result.duration,
          success: result.success,
          output: includeDescriptions ? result.output : undefined,
          metadata: {
            sessionId,
            retryAttempt: context.retryAttempt,
            lastError: context.lastError,
          },
        },
      }

      auditManager.writeEvent(event, sessionId)
      logger.debug(`[AUDIT] Task completed: ${context.task.id} in ${result.duration}ms`)
    },

    async onTaskFailed(context: TaskContext, error: string) {
      if (!shouldLogEvent('task_failed')) return

      const taskData = extractTaskData(context.task)

      const event: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'task_failed',
        taskId: context.task.id,
        taskTitle: context.task.title,
        namespace: context.namespace,
        iteration: context.iteration,
        data: {
          ...taskData,
          error,
          metadata: {
            sessionId,
            retryAttempt: context.retryAttempt,
            lastError: context.lastError,
          },
        },
      }

      auditManager.writeEvent(event, sessionId)
      logger.debug(`[AUDIT] Task failed: ${context.task.id} - ${error}`)
    },

    async onStep(event: StepEvent) {
      if (!shouldLogEvent('step_event')) return

      const data: Record<string, unknown> = {
        stepId: event.stepId,
        stepDescription: event.description,
        stepPhase: event.phase,
        metadata: {
          sessionId,
        },
      }

      if (event.durationMs !== undefined) {
        data.duration = event.durationMs
      }

      if (event.context) {
        data.metadata = { 
          ...data.metadata as Record<string, unknown>, 
          ...event.context 
        }
      }

      const auditEvent: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'step_event',
        namespace: (event.context?.namespace as string) || 'unknown',
        taskId: event.context?.taskId as string | undefined,
        data: data as AuditEvent['data'],
      }

      auditManager.writeEvent(auditEvent, sessionId)
      logger.debug(`[AUDIT] Step ${event.phase}: ${event.stepId} - ${event.description}`)
    },

    async onToolCall(event: ToolCallEvent) {
      if (!shouldLogEvent('tool_call')) return

      const auditEvent: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'tool_call',
        namespace: (event.metadata?.namespace as string) || 'unknown',
        taskId: event.taskId,
        data: {
          toolName: event.toolName,
          toolArguments: event.arguments,
          metadata: {
            sessionId,
          },
        },
      }

      if (event.timestamp) {
        auditEvent.data.metadata = {
          ...auditEvent.data.metadata,
          toolTimestamp: event.timestamp,
        }
      }

      auditManager.writeEvent(auditEvent, sessionId)
      logger.debug(`[AUDIT] Tool call: ${event.toolName}`)
    },

    async onAgentResponse(event: AgentResponseEvent) {
      if (!shouldLogEvent('agent_response')) return

      const auditEvent: AuditEvent = {
        id: generateEventId(),
        timestamp: new Date().toISOString(),
        eventType: 'agent_response',
        namespace: (event.metadata?.namespace as string) || 'unknown',
        taskId: event.taskId,
        data: {
          responseText: event.responseText,
          model: event.model,
          isPartial: event.isPartial,
          metadata: {
            sessionId,
          },
        },
      }

      if (event.timestamp) {
        auditEvent.data.metadata = {
          ...auditEvent.data.metadata,
          responseTimestamp: event.timestamp,
        }
      }

      auditManager.writeEvent(auditEvent, sessionId)
      logger.debug(`[AUDIT] Agent response from ${event.model}`)
    },
  }
}

export function withAuditLogging(config: AuditConfig = {}): ConfigWrapper {
  const plugin = createAuditLoggingPlugin(config)

  return (config) => ({
    ...config,
    plugins: [...(config.plugins || []), plugin],
  })
}
