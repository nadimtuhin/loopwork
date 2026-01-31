import { logger } from '../core/utils'
import type { ErrorPattern, PatternMatch, MonitorAction } from './types'

/**
 * PatternDetector - Detects known error patterns in log lines
 *
 * Uses regex patterns to match and categorize error types.
 */
export class PatternDetector {
  private patterns: ErrorPattern[] = []

  constructor(private config?: { customPatterns?: ErrorPattern[] }) {
    this.registerDefaultPatterns()
    if (config?.customPatterns) {
      this.patterns.push(...config.customPatterns)
    }
  }

  /**
   * Register default error patterns
   */
  private registerDefaultPatterns(): void {
    this.patterns = [
      {
        name: 'prd-not-found',
        pattern: /PRD file not found: (.+)/i,
        severity: 'WARN',
        autoAction: (match) => ({
          type: 'auto-fix',
          fn: async () => this.createMissingPRD(match[1])
        }),
      },
      {
        name: 'rate-limit',
        pattern: /Rate limit/i,
        severity: 'HIGH',
        autoAction: () => ({
          type: 'pause',
          reason: 'Rate limit detected, waiting for cooldown',
          duration: 60000, // 60 seconds
        }),
      },
      {
        name: 'env-var-required',
        pattern: /(\w+) is required/i,
        severity: 'ERROR',
        autoAction: (_match) => ({
          type: 'skip',
          target: 'plugin',
        }),
      },
      {
        name: 'task-failed-repeated',
        pattern: /Task \S+ failed \d+ times/i,
        severity: 'HIGH',
        autoAction: () => ({
          type: 'circuit-break',
        }),
      },
      {
        name: 'timeout-exceeded',
        pattern: /Timeout exceeded/i,
        severity: 'WARN',
        autoAction: () => ({
          type: 'retry-task',
        }),
      },
      {
        name: 'no-pending-tasks',
        pattern: /No pending tasks/i,
        severity: 'INFO',
      },
      {
        name: 'task-early-exit',
        pattern: /(exited early|terminated|cancelled|aborted)/i,
        severity: 'MEDIUM',
        autoAction: (match) => this.handleEarlyExit(match),
      },
      {
        name: 'task-incomplete',
        pattern: /(Task \S+ (failed|incomplete)|completion failed)/i,
        severity: 'MEDIUM',
        autoAction: () => ({
          type: 'enhance-task',
        } as any),
      },
      {
        name: 'permission-denied',
        pattern: /(Permission denied|Access denied|EACCES|EPERM)/i,
        severity: 'ERROR',
        autoAction: () => ({
          type: 'skip',
          target: 'task',
        }),
      },
      {
        name: 'missing-dependency',
        pattern: /(Cannot find module|Module not found|ENOTFOUND)/i,
        severity: 'ERROR',
        autoAction: () => ({
          type: 'skip',
          target: 'task',
        }),
      },
      {
        name: 'network-error',
        pattern: /(ECONNREFUSED|ETIMEDOUT|ENETUNREACH|fetch failed)/i,
        severity: 'ERROR',
        autoAction: () => ({
          type: 'analyze',
          prompt: 'Network error detected. Analyze the logs and suggest a fix.',
        }),
      },
    ]
  }

  /**
   * Detect patterns in a log line
   */
  detect(line: string): PatternMatch | null {
    for (const pattern of this.patterns) {
      const matches = line.match(pattern.pattern)
      if (matches) {
        return {
          pattern: pattern.name,
          severity: pattern.severity,
          matches,
          action: pattern.autoAction?.(matches),
          line,
          timestamp: new Date(),
        }
      }
    }

    return null
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): ErrorPattern[] {
    return [...this.patterns]
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: ErrorPattern): void {
    this.patterns.push(pattern)
    logger.debug(`Added pattern: ${pattern.name}`)
  }

  /**
   * Remove pattern by name
   */
  removePattern(name: string): void {
    const index = this.patterns.findIndex(p => p.name === name)
    if (index !== -1) {
      this.patterns.splice(index, 1)
      logger.debug(`Removed pattern: ${name}`)
    }
  }

  /**
   * Handle early exit detection
   */
  private handleEarlyExit(match: RegExpMatchArray): MonitorAction {
    const context = match.input as string

    if (context.includes('unclear requirements') || context.includes('need more detail')) {
      return {
        type: 'enhance-task',
        target: 'prd',
        taskId: this.extractTaskId(context),
      }
    }

    if (context.includes('cannot find') || context.includes('where is')) {
      return {
        type: 'enhance-task',
        target: 'docs',
        taskId: this.extractTaskId(context),
      }
    }

    return {
      type: 'analyze',
      prompt: `Task exited early. Context: ${context.slice(0, 200)}`,
    }
  }

  /**
   * Extract task ID from log line
   */
  private extractTaskId(line: string): string {
    const match = line.match(/(?:TASK-|task-)?(\S{4}-\d{3})/i)
    return match ? match[1].toUpperCase() : 'UNKNOWN'
  }

  /**
   * Create missing PRD file
   */
  private async createMissingPRD(taskId: string): Promise<void> {
    const fs = await import('fs')
    const path = await import('path')

    const prdPath = path.join(process.cwd(), '.specs', 'tasks', `${taskId}.md`)
    const tasksJsonPath = path.join(process.cwd(), '.specs', 'tasks', 'tasks.json')

    try {
      if (!fs.existsSync(prdPath)) {
        const tasksDir = path.dirname(prdPath)
        if (!fs.existsSync(tasksDir)) {
          fs.mkdirSync(tasksDir, { recursive: true })
        }

        const prdContent = `# ${taskId}

## Goal
Auto-generated PRD - task description was missing or incomplete.

## Requirements
- Review the task context from execution logs
- Add specific requirements and success criteria

## Notes
This PRD was auto-generated by the AI Monitor.
Please review and update with proper task description before execution.

`

        fs.writeFileSync(prdPath, prdContent)
        logger.info(`Created missing PRD: ${prdPath}`)

        if (fs.existsSync(tasksJsonPath)) {
          const tasksData = JSON.parse(fs.readFileSync(tasksJsonPath, 'utf-8'))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const taskEntry = tasksData.tasks.find((t: any) => t.id === taskId)
          if (taskEntry && !taskEntry.description) {
            taskEntry.description = prdContent
            fs.writeFileSync(tasksJsonPath, JSON.stringify(tasksData, null, 2))
            logger.info(`Updated task description in ${tasksJsonPath}`)
          }
        }
      } else {
        logger.warn(`PRD already exists: ${prdPath}`)
      }
    } catch (error) {
      logger.error(`Failed to create PRD for ${taskId}: ${error}`)
    }
  }
}
