/**
 * Audit Querying and Export
 *
 * Provides functionality to query, filter, and export audit logs
 */

import type { AuditEvent } from './audit-logging'
import { logger } from '@loopwork-ai/loopwork'
import fs from 'fs'
import path from 'path'

export interface AuditQuery {
  eventType?: AuditEvent['eventType'][]
  taskId?: string
  namespace?: string
  startDate?: string
  endDate?: string
  limit?: number
}

export interface AuditExportOptions {
  format?: 'json' | 'csv'
  outputPath?: string
  auditDir?: string
  query?: AuditQuery
}

export interface AuditReport {
  totalEvents: number
  eventsByType: Record<string, number>
  eventsByTask: Record<string, number>
  tasksCompleted: number
  tasksFailed: number
  dateRange: {
    start: string
    end: string
  }
  events: AuditEvent[]
}

export function createAuditQueryManager(auditDir: string): AuditQueryManager {
  return new AuditQueryManager(auditDir)
}

class AuditQueryManager {
  private auditDir: string

  constructor(auditDir: string) {
    this.auditDir = auditDir
  }

  private getAuditFiles(): string[] {
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

  private parseEvent(line: string): AuditEvent | null {
    try {
      return JSON.parse(line) as AuditEvent
    } catch {
      return null
    }
  }

  query(query: AuditQuery): AuditEvent[] {
    const files = this.getAuditFiles()
    const events: AuditEvent[] = []

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8')
        const lines = content.split('\n').filter((line) => line.trim())

          for (const line of lines) {
          const event = this.parseEvent(line)
          if (!event) continue

          if (query.eventType && !query.eventType.includes(event.eventType)) continue
          if (query.taskId && event.taskId !== query.taskId) continue
          if (query.namespace && event.namespace !== query.namespace) continue

          const eventTime = new Date(event.timestamp)

          if (query.startDate) {
            const startTime = new Date(query.startDate)
            if (eventTime < startTime) continue
          }

          if (query.endDate) {
            const endTime = new Date(query.endDate)
            if (eventTime > endTime) continue
          }

          events.push(event)
          if (query.limit && events.length >= query.limit) break
        }
      } catch (error) {
        logger.warn(`Failed to read audit file ${file}: ${error}`)
      }
    }

    return events
  }

  generateReport(events: AuditEvent[]): AuditReport {
    const summary = {
      totalEvents: events.length,
      eventsByType: {} as Record<string, number>,
      eventsByTask: {} as Record<string, number>,
      tasksCompleted: 0,
      tasksFailed: 0,
      dateRange: {
        start: '',
        end: '',
      },
    }

    for (const event of events) {
      summary.eventsByType[event.eventType] = (summary.eventsByType[event.eventType] || 0) + 1

      if (event.taskId) {
        const taskKey = event.taskId
        if (!summary.eventsByTask[taskKey]) {
          summary.eventsByTask[taskKey] = 0
        }

        if (event.eventType === 'task_complete') {
          summary.eventsByTask[taskKey]++
          summary.tasksCompleted++
        } else if (event.eventType === 'task_failed') {
          summary.eventsByTask[taskKey]++
          summary.tasksFailed++
        }
      }

      if (events.length > 0) {
        const timestamps = events.map((e) => new Date(e.timestamp))
        const minTime = Math.min(...timestamps.map(t => t.getTime()))
        const maxTime = Math.max(...timestamps.map(t => t.getTime()))
        summary.dateRange.start = new Date(minTime).toISOString()
        summary.dateRange.end = new Date(maxTime).toISOString()
      }
    }

    return {
      ...summary,
      events,
    }
  }

  exportToCSV(events: AuditEvent[], outputPath: string): void {
    const headers = ['ID', 'Timestamp', 'EventType', 'TaskID', 'Title', 'Namespace', 'Iteration', 'Duration', 'Status', 'Priority', 'Feature', 'Error', 'Plugin', 'Hook', 'Tool', 'Model', 'IsPartial']

    const rows = events.map((event) => [
      event.id,
      event.timestamp,
      event.eventType,
      event.taskId || '',
      event.taskTitle || '',
      event.namespace || '',
      event.iteration?.toString() || '',
      event.data?.duration?.toString() || '',
      event.data?.status || '',
      event.data?.priority || '',
      event.data?.feature || '',
      event.data?.error || '',
      event.data?.pluginName || '',
      event.data?.hookName || '',
      event.data?.toolName || '',
      event.data?.model || '',
      event.data?.isPartial?.toString() || '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const defaultPath = outputPath || path.join(this.auditDir, 'audit_export.csv')

    try {
      fs.writeFileSync(defaultPath, csvContent, 'utf8')
      logger.success(`Exported audit to ${defaultPath}`)
    } catch (error) {
      logger.error(`Failed to export audit: ${error}`)
    }
  }
}

export function queryAuditLogs(auditDir: string = '.loopwork/audit/', query: AuditQuery = {}): AuditEvent[] {
  const manager = new AuditQueryManager(auditDir)
  return manager.query(query)
}

export function exportAuditLogs(options: AuditExportOptions = {}): void {
  const {
    format = 'json',
    outputPath,
    query,
  } = options

  const manager = new AuditQueryManager(options.auditDir || '.loopwork/audit/')

  const events = query ? manager.query(query) : manager.query({})

  if (format === 'csv') {
    manager.exportToCSV(events, outputPath!)
  } else {
    const auditDirPath = options.auditDir || '.loopwork/audit/'
    const defaultPath = outputPath || path.join(auditDirPath, 'audit_export.json')

    try {
      fs.writeFileSync(defaultPath, JSON.stringify(events, null, 2), 'utf8')
      logger.success(`Exported audit to ${defaultPath}`)
    } catch (error) {
      logger.error(`Failed to export audit: ${error}`)
    }
  }
}
