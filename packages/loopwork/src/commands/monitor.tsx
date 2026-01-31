import React from 'react'
import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'
import { logger, InkTable, separator, renderInk } from '../core/utils'
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
        'ERR_PROCESS_SPAWN',
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
        'ERR_MONITOR_START',
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
        'ERR_MONITOR_STOP',
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
    logger: activeLogger = logger,
  } = resolveDeps(deps)
  const projectRoot = findProjectRoot()
  const monitor = new MonitorClass(projectRoot)
  const { running, namespaces } = monitor.getStatus()

  activeLogger.raw('')
  activeLogger.raw(chalk.bold('Loopwork Monitor Status'))
  activeLogger.raw(separator('light'))

  if (running.length === 0) {
    activeLogger.raw(chalk.gray('No loops currently running'))
    activeLogger.raw('')
  } else {
    activeLogger.raw('')
    activeLogger.raw(chalk.bold(`Running (${running.length}):`))
    const tableOutput = renderInk(
      <InkTable
        headers={['Namespace', 'PID', 'Uptime', 'Log File']}
        columnConfigs={[
          { align: 'left' },
          { align: 'right' },
          { align: 'right' },
          { align: 'left' },
        ]}
        rows={running.map(proc => [
          chalk.bold(proc.namespace),
          proc.pid.toString(),
          formatUptime(proc.startedAt),
          proc.logFile,
        ])}
      />
    )
    activeLogger.raw(tableOutput)
  }

  if (namespaces.length > 0) {
    activeLogger.raw('')
    activeLogger.raw(chalk.bold('All Namespaces:'))
    const tableOutput = renderInk(
      <InkTable
        headers={['', 'Namespace', 'Last Run']}
        columnConfigs={[
          { align: 'center' },
          { align: 'left' },
          { align: 'left' },
        ]}
        rows={namespaces.map(ns => [
          ns.status === 'running' ? chalk.green('\u25cf') : chalk.gray('\u25cb'),
          ns.name,
          ns.lastRun ? chalk.gray(ns.lastRun) : chalk.gray('-'),
        ])}
      />
    )
    activeLogger.raw(tableOutput)
  }

  activeLogger.raw('')
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
    logger: activeLogger = logger,
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
      activeLogger.info(`Namespace: ${namespace} (running)`)
      activeLogger.info(`Uptime: ${formatUptime(proc.startedAt)}`)
      activeLogger.info(`Log: ${logFile}`)
    } else {
      // Find latest session
      const session = logUtils.findLatestSession(projectRoot, namespace)
      if (session) {
        logFile = logUtils.getMainLogFile(session.fullPath)
        activeLogger.info(`Namespace: ${namespace} (stopped)`)
        activeLogger.info(`Last run: ${session.timestamp}`)
        if (logFile) {
          activeLogger.info(`Log: ${logFile}`)
        }
      }
    }

    if (!logFile) {
      throw new LoopworkErrorClass(
        'ERR_FILE_NOT_FOUND',
        `No logs found for namespace '${namespace}'`,
        [
          'Check if the namespace exists: loopwork status',
          'Run the loop first: loopwork start',
          `Available namespaces can be seen with: loopwork status`
        ]
      )
    }

    activeLogger.raw('')

    if (options.follow) {
      activeLogger.info('(Press Ctrl+C to stop)')
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
    } else {
      // Just show last N lines
      const logLines = logUtils.readLastLines(logFile, lines)
      logLines.forEach(line => {
        if (line.trim()) {
          activeLogger.raw(logUtils.formatLogLine(line))
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
