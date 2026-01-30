import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'
import { logger } from '../core/utils'
import { LoopworkError, handleError } from '../core/errors'
import {
  findLatestSession,
  tailLogs,
  formatLogLine,
  getMainLogFile,
  readLastLines,
} from './shared/log-utils'
import { formatUptime, findProjectRoot } from './shared/process-utils'

export interface MonitorStartOptions {
  namespace: string
  args: string[]
}

export interface MonitorLogsOptions {
  namespace?: string
  lines?: number
  follow?: boolean
}

type MonitorDeps = {
  MonitorClass?: typeof LoopworkMonitor
  findProjectRoot?: typeof findProjectRoot
  formatUptime?: typeof formatUptime
  logger?: typeof logger
  handleError?: typeof handleError
  LoopworkErrorClass?: typeof LoopworkError
  logUtils?: {
    findLatestSession?: typeof findLatestSession
    tailLogs?: typeof tailLogs
    formatLogLine?: typeof formatLogLine
    getMainLogFile?: typeof getMainLogFile
    readLastLines?: typeof readLastLines
  }
  process?: NodeJS.Process
}

function resolveDeps(deps: MonitorDeps = {}) {
  return {
    MonitorClass: deps.MonitorClass ?? LoopworkMonitor,
    findProjectRoot: deps.findProjectRoot ?? findProjectRoot,
    formatUptime: deps.formatUptime ?? formatUptime,
    logger: deps.logger ?? logger,
    handleError: deps.handleError ?? handleError,
    LoopworkErrorClass: deps.LoopworkErrorClass ?? LoopworkError,
    logUtils: {
      findLatestSession: deps.logUtils?.findLatestSession ?? findLatestSession,
      tailLogs: deps.logUtils?.tailLogs ?? tailLogs,
      formatLogLine: deps.logUtils?.formatLogLine ?? formatLogLine,
      getMainLogFile: deps.logUtils?.getMainLogFile ?? getMainLogFile,
      readLastLines: deps.logUtils?.readLastLines ?? readLastLines,
    },
    process: deps.process ?? process,
  }
}

/**
 * Monitor start subcommand - start a loop in daemon mode
 */
export async function monitorStart(options: MonitorStartOptions, deps: MonitorDeps = {}): Promise<void> {
  const {
    MonitorClass,
    findProjectRoot,
    logger,
    handleError,
    LoopworkErrorClass,
    process: proc,
  } = resolveDeps(deps)
  try {
    const projectRoot = findProjectRoot()
    const monitor = new MonitorClass(projectRoot)

    // Check if already running
    const running = monitor.getRunningProcesses()
    const existing = running.find(p => p.namespace === options.namespace)

    if (existing) {
      throw new LoopworkErrorClass(
        `Namespace '${options.namespace}' is already running (PID: ${existing.pid})`,
        [
          `Use 'loopwork monitor stop ${options.namespace}' to stop it first`,
          "Or use a different namespace: --namespace <name>"
        ]
      )
    }

    logger.info(`Starting loop in namespace '${options.namespace}'...`)

    const result = await monitor.start(options.namespace, options.args)

    if (result.success) {
      logger.success(`Started (PID: ${result.pid})`)
      logger.info(`View logs: loopwork monitor logs ${options.namespace}`)
    } else {
      throw new LoopworkErrorClass(
        `Failed to start: ${result.error}`,
        [
          'Check system resources and permissions',
          'Verify your configuration is correct'
        ]
      )
    }
  } catch (error) {
    if (error instanceof LoopworkErrorClass) {
      handleError(error)
      proc.exit(1)
      return
    }
    throw error
  }
}

/**
 * Monitor stop subcommand - stop a running loop
 */
export async function monitorStop(namespace: string, deps: MonitorDeps = {}): Promise<void> {
  const {
    MonitorClass,
    findProjectRoot,
    logger,
    handleError,
    LoopworkErrorClass,
    process: proc,
  } = resolveDeps(deps)
  try {
    const projectRoot = findProjectRoot()
    const monitor = new MonitorClass(projectRoot)

    const result = monitor.stop(namespace)

    if (result.success) {
      logger.success(`Stopped namespace '${namespace}'`)
    } else {
      throw new LoopworkErrorClass(
        result.error || 'Failed to stop',
        [
          `Check if namespace '${namespace}' is actually running`,
          'Try killing the process manually: loopwork status'
        ]
      )
    }
  } catch (error) {
    if (error instanceof LoopworkErrorClass) {
      handleError(error)
      proc.exit(1)
      return
    }
    throw error
  }
}

/**
 * Monitor status subcommand - show status of all loops
 */
export async function monitorStatus(deps: MonitorDeps = {}): Promise<void> {
  const {
    MonitorClass,
    findProjectRoot,
    formatUptime,
    process: runtimeProcess,
  } = resolveDeps(deps)
  const projectRoot = findProjectRoot()
  const monitor = new MonitorClass(projectRoot)
  const { running, namespaces } = monitor.getStatus()

  runtimeProcess.stdout.write(chalk.bold('\nLoopwork Monitor Status') + '\n')
  runtimeProcess.stdout.write(chalk.gray('-'.repeat(50)) + '\n')

  if (running.length === 0) {
    runtimeProcess.stdout.write(chalk.gray('No loops currently running\n') + '\n')
  } else {
    runtimeProcess.stdout.write(chalk.bold(`\nRunning (${running.length}):`) + '\n')
    for (const proc of running) {
      const uptime = formatUptime(proc.startedAt)
      runtimeProcess.stdout.write(`  ${chalk.green('\u25cf')} ${chalk.bold(proc.namespace)}\n`)
      runtimeProcess.stdout.write(`    PID: ${proc.pid} | Uptime: ${uptime}\n`)
      runtimeProcess.stdout.write(`    Log: ${proc.logFile}\n`)
    }
  }

  if (namespaces.length > 0) {
    runtimeProcess.stdout.write(chalk.bold('\nAll namespaces:') + '\n')
    for (const ns of namespaces) {
      const icon = ns.status === 'running' ? chalk.green('\u25cf') : chalk.gray('\u25cb')
      const lastRunStr = ns.lastRun ? chalk.gray(`(last: ${ns.lastRun})`) : ''
      runtimeProcess.stdout.write(`  ${icon} ${ns.name} ${lastRunStr}\n`)
    }
  }

  runtimeProcess.stdout.write('\n')
}

/**
 * Monitor logs subcommand - show logs for a namespace
 */
export async function monitorLogs(options: MonitorLogsOptions, deps: MonitorDeps = {}): Promise<void> {
  const {
    MonitorClass,
    findProjectRoot,
    formatUptime,
    handleError,
    LoopworkErrorClass,
    logUtils,
    process: runtimeProcess,
  } = resolveDeps(deps)
  try {
    const projectRoot = findProjectRoot()
    const monitor = new MonitorClass(projectRoot)
    const namespace = options.namespace || 'default'
    const lines = options.lines || 50

    // Check if running
    const running = monitor.getRunningProcesses()
    const proc = running.find(p => p.namespace === namespace)

    let logFile: string | null = null

    if (proc) {
      logFile = proc.logFile
      runtimeProcess.stdout.write(chalk.gray(`Namespace: ${namespace} (running)`) + '\n')
      runtimeProcess.stdout.write(chalk.gray(`Uptime: ${formatUptime(proc.startedAt)}`) + '\n')
      runtimeProcess.stdout.write(chalk.gray(`Log: ${logFile}`) + '\n')
    } else {
      // Find latest session
      const session = logUtils.findLatestSession(projectRoot, namespace)
      if (session) {
        logFile = logUtils.getMainLogFile(session.fullPath)
        runtimeProcess.stdout.write(chalk.gray(`Namespace: ${namespace} (stopped)`) + '\n')
        runtimeProcess.stdout.write(chalk.gray(`Last run: ${session.timestamp}`) + '\n')
        if (logFile) {
          runtimeProcess.stdout.write(chalk.gray(`Log: ${logFile}`) + '\n')
        }
      }
    }

    if (!logFile) {
      throw new LoopworkErrorClass(
        `No logs found for namespace '${namespace}'`,
        [
          'Check if the namespace exists: loopwork status',
          'Run the loop first: loopwork start',
          `Available namespaces can be seen with: loopwork status`
        ]
      )
    }

    runtimeProcess.stdout.write('\n')

    if (options.follow) {
      runtimeProcess.stdout.write(chalk.gray('(Press Ctrl+C to stop)\n') + '\n')

      // Show initial lines
      const initial = logUtils.readLastLines(logFile, lines)
      initial.forEach(line => {
        if (line.trim()) {
          runtimeProcess.stdout.write(logUtils.formatLogLine(line))
        }
      })

      // Start tailing
      const { stop } = logUtils.tailLogs(logFile, {
        onLine: (line) => {
          runtimeProcess.stdout.write(logUtils.formatLogLine(line))
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
          runtimeProcess.stdout.write(logUtils.formatLogLine(line))
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
 * Monitor tail subcommand - tail logs in real-time
 */
export async function monitorTail(namespace: string = 'default'): Promise<void> {
  // Tail is just logs with follow=true
  await monitorLogs({ namespace, follow: true })
}

/**
 * Create the monitor command configuration for CLI registration
 */
export function createMonitorCommand() {
  return {
    name: 'monitor',
    description: 'Legacy monitor commands (deprecated - use start/logs/kill/status instead)',
    subcommands: [
      {
        name: 'start',
        description: 'Start a daemon (deprecated - use "loopwork start -d")',
        handler: monitorStart,
      },
      {
        name: 'stop',
        description: 'Stop a daemon (deprecated - use "loopwork kill")',
        handler: monitorStop,
      },
      {
        name: 'status',
        description: 'Show status (deprecated - use "loopwork status")',
        handler: monitorStatus,
      },
      {
        name: 'logs',
        description: 'View logs (deprecated - use "loopwork logs")',
        handler: monitorLogs,
      },
      {
        name: 'tail',
        description: 'Tail logs (deprecated - use "loopwork logs --follow")',
        handler: monitorTail,
      },
    ],
    seeAlso: [
      'loopwork start     Recommended replacement for monitor start',
      'loopwork kill      Recommended replacement for monitor stop',
      'loopwork status    Recommended replacement for monitor status',
      'loopwork logs      Recommended replacement for monitor logs',
    ],
  }
}
