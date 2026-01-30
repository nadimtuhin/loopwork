import chalk from 'chalk'
import { logger } from '../core/utils'
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

export interface LogsOptions {
  follow?: boolean
  lines?: number
  session?: string
  task?: string
  namespace?: string
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
  return {
    MonitorClass: deps.MonitorClass ?? LoopworkMonitor,
    logger: deps.logger ?? logger,
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
 * View logs for a namespace
 *
 * By default, shows the last 50 lines of the main log file.
 * Use --follow to tail logs in real-time.
 * Use --task to view a specific iteration's prompt and output.
 */
export async function logs(options: LogsOptions = {}, deps: LogsDeps = {}): Promise<void> {
  const {
    MonitorClass,
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

    // Check if running
    const running = monitor.getRunningProcesses()
    const proc = running.find(p => p.namespace === ns)

    let logFile: string | null = null
    let sessionPath: string | null = null

    if (proc && !options.session) {
      // Use running process log file
      logFile = proc.logFile
      runtimeProcess.stdout.write(chalk.gray(`Namespace: ${ns} (running)`) + '\n')
      runtimeProcess.stdout.write(chalk.gray(`Uptime: ${formatUptime(proc.startedAt)}`) + '\n')
      runtimeProcess.stdout.write(chalk.gray(`Log: ${logFile}`) + '\n')
    } else {
      // Find session
      let session
      if (options.session) {
        // Find specific session
        const sessions = logUtils.listSessions(projectRoot, ns)
        session = sessions.find(s => s.timestamp === options.session || s.timestamp.startsWith(options.session!))
        if (!session) {
          throw new LoopworkErrorClass(
            `Session '${options.session}' not found for namespace '${ns}'`,
            [
              'List available sessions: ls .loopwork-runs/' + ns,
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
        runtimeProcess.stdout.write(chalk.gray(`Namespace: ${ns} ${proc ? '(running)' : '(stopped)'}`) + '\n')
        runtimeProcess.stdout.write(chalk.gray(`Session: ${session.timestamp}`) + '\n')
        if (logFile) {
          runtimeProcess.stdout.write(chalk.gray(`Log: ${logFile}`) + '\n')
        }
      }
    }

    if (!logFile) {
      throw new LoopworkErrorClass(
        `No logs found for namespace '${ns}'`,
        [
          'Start loopwork to generate logs: loopwork start',
          'Check if the namespace name is correct',
          `Checked directory: ${projectRoot}/.loopwork/runs/${ns}`
        ]
      )
    }

    runtimeProcess.stdout.write('\n')

    // If task filter specified, show only that task's logs
    if (options.task && sessionPath) {
      const taskMatch = options.task.match(/^(?:iteration-)?(\d+)$/)
      if (!taskMatch) {
        throw new LoopworkErrorClass(
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
          `No logs found for iteration ${iteration}`,
          [
            'Check if the iteration number is correct',
            `Check the session directory: ${sessionPath}/logs`,
            'Verify that the task actually started'
          ]
        )
      }

      runtimeProcess.stdout.write(chalk.bold(`=== Iteration ${iteration} ===\n`) + '\n')

      if (taskLogs.prompt) {
        runtimeProcess.stdout.write(chalk.cyan('--- Prompt ---') + '\n')
        runtimeProcess.stdout.write(taskLogs.prompt + '\n')
        runtimeProcess.stdout.write('\n')
      }

      if (taskLogs.output) {
        runtimeProcess.stdout.write(chalk.green('--- Output ---') + '\n')
        runtimeProcess.stdout.write(taskLogs.output + '\n')
      }

      return
    }

    // Follow mode
    if (options.follow) {
      runtimeProcess.stdout.write(chalk.gray('(Press Ctrl+C to stop)\n') + '\n')

      // Show initial lines
      const initial = logUtils.readLastLines(logFile, lines)
      initial.forEach(line => {
        if (line.trim()) {
          runtimeProcess.stdout.write(logUtils.formatLogLine(line) + '\n')
        }
      })

      // Start tailing
      const { stop } = logUtils.tailLogs(logFile, {
        onLine: (line) => {
          runtimeProcess.stdout.write(logUtils.formatLogLine(line) + '\n')
        },
      })

      runtimeProcess.on('SIGINT', () => {
        stop()
        runtimeProcess.stdout.write('\n')
        runtimeProcess.exit(0)
      })

      // Keep process alive
      await new Promise(() => {})
    } else {
      // Just show last N lines
      const logLines = logUtils.readLastLines(logFile, lines)
      logLines.forEach(line => {
        if (line.trim()) {
          runtimeProcess.stdout.write(logUtils.formatLogLine(line) + '\n')
        }
      })
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
