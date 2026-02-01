import React from 'react'
import chalk from 'chalk'
import { logger, separator, InkBanner, renderInk } from '../core/utils'
import { LoopworkMonitor } from '../monitor'
import { LoopworkError, handleError } from '../core/errors'
import {
  findLatestSession,
  listSessions,
  tailLogs,
  formatLogLine,
  getMainLogFile,
  readLastLines,
  getTaskLogs,
} from './shared/log-utils'
import { formatUptime, findProjectRoot } from './shared/process-utils'
import type { LogsJsonOutput } from '../contracts/output'

export interface LogsOptions {
  follow?: boolean
  lines?: number
  session?: string
  task?: string
  namespace?: string
  json?: boolean
}

type LogsDeps = {
  MonitorClass?: typeof LoopworkMonitor
  logger?: typeof logger
  findProjectRoot?: typeof findProjectRoot
  formatUptime?: typeof formatUptime
  LoopworkErrorClass?: typeof LoopworkError
  handleError?: typeof handleError
  logUtils?: {
    findLatestSession?: typeof findLatestSession
    listSessions?: typeof listSessions
    tailLogs?: typeof tailLogs
    formatLogLine?: typeof formatLogLine
    getMainLogFile?: typeof getMainLogFile
    readLastLines?: typeof readLastLines
    getTaskLogs?: typeof getTaskLogs
  }
  process?: NodeJS.Process
}

function resolveDeps(deps: LogsDeps = {}) {
  const activeLogger = deps.logger ?? logger
  return {
    MonitorClass: deps.MonitorClass ?? LoopworkMonitor,
    logger: activeLogger,
    findProjectRoot: deps.findProjectRoot ?? findProjectRoot,
    formatUptime: deps.formatUptime ?? formatUptime,
    LoopworkErrorClass: deps.LoopworkErrorClass ?? LoopworkError,
    handleError: deps.handleError ?? handleError,
    logUtils: {
      findLatestSession: deps.logUtils?.findLatestSession ?? findLatestSession,
      listSessions: deps.logUtils?.listSessions ?? listSessions,
      tailLogs: deps.logUtils?.tailLogs ?? tailLogs,
      formatLogLine: deps.logUtils?.formatLogLine ?? formatLogLine,
      getMainLogFile: deps.logUtils?.getMainLogFile ?? getMainLogFile,
      readLastLines: deps.logUtils?.readLastLines ?? readLastLines,
      getTaskLogs: deps.logUtils?.getTaskLogs ?? getTaskLogs,
    },
    process: deps.process ?? process,
  }
}

/**
 * Parse a log line into structured format for JSON output
 */
function parseLogLine(line: string): { timestamp: string; level: string; message: string; raw: string } {
  // Format: [HH:MM:SS AM/PM] [LEVEL] message
  const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/)

  if (match) {
    return {
      timestamp: match[1],
      level: match[2],
      message: match[3],
      raw: line,
    }
  }

  return {
    timestamp: '',
    level: '',
    message: line,
    raw: line,
  }
}

/**
 * View logs for a namespace
 *
 * By default, shows the last 50 lines of the main log file.
 * Use --follow to tail logs in real-time.
 * Use --task to view a specific iteration's prompt and output.
 */
export async function logs(options: LogsOptions = {}, deps: LogsDeps = {}): Promise<void> {
  const {
    MonitorClass,
    logger: activeLogger,
    findProjectRoot,
    formatUptime,
    LoopworkErrorClass,
    handleError,
    logUtils,
    process: runtimeProcess,
  } = resolveDeps(deps)
  try {
    const ns = options.namespace || 'default'
    const lines = options.lines || 50
    const projectRoot = findProjectRoot()
    const monitor = new MonitorClass(projectRoot)
    const isJsonMode = options.json === true

    // Check if running
    const running = monitor.getRunningProcesses()
    const proc = running.find(p => p.namespace === ns)

    let logFile: string | null = null
    let sessionPath: string | null = null

    if (proc && !options.session) {
      // Use running process log file
      logFile = proc.logFile
      if (!isJsonMode) {
        const bannerOutput = await renderInk(
          <InkBanner
            title="Session Info"
            rows={[
              { key: 'Namespace', value: `${ns} (running)` },
              { key: 'Uptime', value: formatUptime(proc.startedAt) },
              { key: 'Log', value: logFile },
            ]}
          />
        )
        activeLogger.raw(bannerOutput)
        activeLogger.raw(separator('light'))
      }
    } else {
      // Find session
      let session
      if (options.session) {
        // Find specific session
        const sessions = logUtils.listSessions(projectRoot, ns)
        session = sessions.find(s => s.timestamp === options.session || s.timestamp.startsWith(options.session!))
        if (!session) {
          throw new LoopworkErrorClass(
            'ERR_FILE_NOT_FOUND',
            `Session '${options.session}' not found for namespace '${ns}'`,
            [
              'List available sessions: ls .loopwork/runs/' + ns,
              'Check the namespace name is correct',
              'Ensure you have already run loopwork in this namespace'
            ]
          )
        }
      } else {
        // Find latest session
        session = logUtils.findLatestSession(projectRoot, ns)
      }

      if (session) {
        sessionPath = session.fullPath
        logFile = logUtils.getMainLogFile(session.fullPath)
        if (!isJsonMode) {
          const rows = [
            { key: 'Namespace', value: `${ns} ${proc ? '(running)' : '(stopped)'}` },
            { key: 'Session', value: session.timestamp },
          ]
          if (logFile) {
            rows.push({ key: 'Log', value: logFile })
          }
          const bannerOutput = await renderInk(
            <InkBanner title="Session Info" rows={rows} />
          )
          activeLogger.raw(bannerOutput)
          activeLogger.raw(separator('light'))
        }
      }
    }

    if (!logFile) {
      throw new LoopworkErrorClass(
        'ERR_FILE_NOT_FOUND',
        `No logs found for namespace '${ns}'`,
        [
          'Start loopwork to generate logs: loopwork start',
          'Check if the namespace name is correct',
          `Checked directory: ${projectRoot}/.loopwork/runs/${ns}`
        ]
      )
    }

    if (!isJsonMode) {
      activeLogger.raw('')
    }

    // If task filter specified, show only that task's logs
    if (options.task && sessionPath) {
      const taskMatch = options.task.match(/^(?:iteration-)?(\d+)$/)
      if (!taskMatch) {
        throw new LoopworkErrorClass(
          'ERR_TASK_INVALID',
          `Invalid task format: '${options.task}'`,
          [
            "Use iteration number (e.g., '3' or 'iteration-3')",
            "Example: loopwork logs --task 1"
          ]
        )
      }

      const iteration = parseInt(taskMatch[1], 10)
      const taskLogs = logUtils.getTaskLogs(sessionPath, iteration)

      if (!taskLogs.prompt && !taskLogs.output) {
        throw new LoopworkErrorClass(
          'ERR_FILE_NOT_FOUND',
          `No logs found for iteration ${iteration}`,
          [
            'Check if the iteration number is correct',
            `Check the session directory: ${sessionPath}/logs`,
            'Verify that the task actually started'
          ]
        )
      }

      if (isJsonMode) {
        const output = {
          command: 'logs',
          namespace: ns,
          timestamp: new Date().toISOString(),
          iteration,
          prompt: taskLogs.prompt || null,
          output: taskLogs.output || null,
          metadata: {
            sessionPath,
          },
        }
        activeLogger.raw(JSON.stringify(output, null, 2))
        return
      }

      activeLogger.raw(chalk.bold(`=== Iteration ${iteration} ===`))
      activeLogger.raw('')

      if (taskLogs.prompt) {
        activeLogger.raw(chalk.cyan('--- Prompt ---'))
        activeLogger.raw(taskLogs.prompt)
        activeLogger.raw('')
      }

      if (taskLogs.output) {
        activeLogger.raw(chalk.green('--- Output ---'))
        activeLogger.raw(taskLogs.output)
      }

      return
    }

    // Follow mode
    if (options.follow) {
      if (isJsonMode) {
        // In JSON mode with follow, emit events as newline-delimited JSON
        const initial = logUtils.readLastLines(logFile, lines)
        const entries = initial.filter(line => line.trim()).map(line => parseLogLine(line))

        entries.forEach(entry => {
          const event = {
            timestamp: entry.timestamp || new Date().toISOString(),
            type: 'info' as const,
            command: 'logs',
            data: entry,
          }
          activeLogger.raw(JSON.stringify(event))
        })

        // Start tailing
        const { stop } = logUtils.tailLogs(logFile, {
          onLine: (line) => {
            const entry = parseLogLine(line)
            const event = {
              timestamp: entry.timestamp || new Date().toISOString(),
              type: 'info' as const,
              command: 'logs',
              data: entry,
            }
            activeLogger.raw(JSON.stringify(event))
          },
        })

        runtimeProcess.on('SIGINT', () => {
          stop()
          runtimeProcess.exit(0)
        })

        // Keep process alive
        await new Promise(() => {})
      } else {
        activeLogger.raw(chalk.gray('(Press Ctrl+C to stop)'))
        activeLogger.raw('')

        // Show initial lines
        const initial = logUtils.readLastLines(logFile, lines)
        initial.forEach(line => {
          if (line.trim()) {
            activeLogger.raw(logUtils.formatLogLine(line))
          }
        })

        // Start tailing
        const { stop } = logUtils.tailLogs(logFile, {
          onLine: (line) => {
            activeLogger.raw(logUtils.formatLogLine(line))
          },
        })

        runtimeProcess.on('SIGINT', () => {
          stop()
          activeLogger.raw('')
          runtimeProcess.exit(0)
        })

        // Keep process alive
        await new Promise(() => {})
      }
    } else {
      // Just show last N lines
      const logLines = logUtils.readLastLines(logFile, lines)

      if (isJsonMode) {
        const entries = logLines.filter(line => line.trim()).map(line => parseLogLine(line))
        const output: LogsJsonOutput = {
          command: 'logs',
          namespace: ns,
          timestamp: new Date().toISOString(),
          entries,
          metadata: {
            sessionPath: sessionPath || '',
            totalLines: entries.length,
            following: false,
          },
        }
        activeLogger.raw(JSON.stringify(output, null, 2))
      } else {
        logLines.forEach(line => {
          if (line.trim()) {
            activeLogger.raw(logUtils.formatLogLine(line))
          }
        })
      }
    }
  } catch (error) {
    if (error instanceof LoopworkErrorClass) {
      handleError(error)
      runtimeProcess.exit(1)
      return
    }
    throw error
  }
}

/**
 * Create the logs command configuration for CLI registration
 */
export function createLogsCommand() {
  return {
    name: 'logs',
    description: 'View logs for a namespace or specific task iteration',
    usage: '[namespace] [options]',
    examples: [
      { command: 'loopwork logs', description: 'Show last 50 lines for default namespace' },
      { command: 'loopwork logs --follow', description: 'Tail logs in real-time' },
      { command: 'loopwork logs --lines 100', description: 'Show last 100 lines' },
      { command: 'loopwork logs prod', description: 'Show logs for prod namespace' },
      { command: 'loopwork logs --task 3', description: 'Show prompt & output for iteration 3' },
      { command: 'loopwork logs --session 2026-01-25', description: 'Show logs from specific session' },
    ],
    seeAlso: [
      'loopwork start     Start daemon to generate logs',
      'loopwork status    Check which namespaces are running',
      'loopwork kill      Stop a running namespace',
    ],
    handler: logs,
  }
}
