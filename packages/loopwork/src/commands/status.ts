import type { LoopworkMonitor } from '../monitor'
import type { ProcessInfo } from '../contracts/process-manager'
import type { ChalkInstance } from 'chalk'
import React from 'react'
import { logger, separator, InkTable, getEmoji, renderInk } from '../core/utils'
import type { StatusJsonOutput } from '../contracts/output'

export interface StatusDeps {
  MonitorClass: typeof LoopworkMonitor
  process: NodeJS.Process
  fs: {
    existsSync: (path: string) => boolean
    readFileSync: (path: string, encoding: string) => string
  }
  path: {
    join: (...paths: string[]) => string
    basename: (path: string) => string
  }
  isProcessAlive: (pid: number) => boolean
  formatUptime: (date: string) => string
  formatDuration: (ms: number) => string
  cwd: () => string
  chalk: ChalkInstance
  logger?: typeof logger
  json?: boolean
}

export async function status(deps: StatusDeps): Promise<void> {
  const { MonitorClass, fs, path, isProcessAlive, formatUptime, formatDuration, cwd, chalk, logger: activeLogger = logger, json: isJsonMode = false } = deps

  const monitor = new MonitorClass()
  const { running: monitorRunning, namespaces } = monitor.getStatus()

  // Check for CLI processes from processes.json (parallel runner)
  const processesFile = path.join(cwd(), '.loopwork/processes.json')
  let cliProcesses: ProcessInfo[] = []
  if (fs.existsSync(processesFile)) {
    try {
      const content = fs.readFileSync(processesFile, 'utf-8')
      const data = JSON.parse(content)
      // Filter to only alive processes
      cliProcesses = (data.processes || []).filter((p: ProcessInfo) => isProcessAlive(p.pid))
    } catch (err) {
      // Only catch JSON parse errors - ignore and continue gracefully
      if (err instanceof SyntaxError) {
        // Ignore parse errors
      } else {
        throw err
      }
    }
  }

  // JSON output mode
  if (isJsonMode) {
    const processes = [
      ...cliProcesses.map(p => ({
        namespace: p.namespace,
        pid: p.pid,
        status: 'running',
        taskId: p.taskId,
        startTime: new Date(p.startTime).toISOString(),
        runtime: Date.now() - p.startTime,
      })),
      ...monitorRunning.map(p => ({
        namespace: p.namespace,
        pid: p.pid,
        status: 'running',
        startTime: p.startedAt,
        runtime: Date.now() - new Date(p.startedAt).getTime(),
      })),
    ]

    const output: StatusJsonOutput = {
      command: 'status',
      timestamp: new Date().toISOString(),
      processes,
      summary: {
        total: processes.length,
        active: processes.length,
      },
    }

    activeLogger.raw(JSON.stringify(output, null, 2))
    return
  }

  // Human-readable output
  activeLogger.raw('')
  activeLogger.raw(chalk.bold('Loopwork Status'))
  activeLogger.raw(separator('light'))

  // Show CLI processes (from run command)
  if (cliProcesses.length > 0) {
    activeLogger.raw('')
    activeLogger.raw(chalk.bold(`Active CLI Processes (${cliProcesses.length}):`))

    const rows = cliProcesses.map(proc => {
      const uptime = formatDuration(Date.now() - proc.startTime)
      const cli = path.basename(proc.command)
      const taskIcon = proc.taskId ? getEmoji('✓') : ''
      const taskDisplay = proc.taskId ? `${taskIcon} ${chalk.cyan(proc.taskId)}` : '-'

      return [
        chalk.bold(cli),
        taskDisplay,
        proc.pid.toString(),
        uptime,
        proc.namespace,
      ]
    })

    const tableOutput = await renderInk(
      React.createElement(InkTable, {
        headers: ['CLI', 'Task', 'PID', 'Uptime', 'Namespace'],
        rows,
      })
    )
    activeLogger.raw(tableOutput)
  }

  // Show monitor processes (from monitor start command)
  if (monitorRunning.length > 0) {
    activeLogger.raw('')
    activeLogger.raw(chalk.bold(`Background Loops (${monitorRunning.length}):`))

    const rows = monitorRunning.map(proc => {
      const uptime = formatUptime(proc.startedAt)
      return [
        chalk.bold(proc.namespace),
        proc.pid.toString(),
        uptime,
        proc.logFile,
      ]
    })

    const tableOutput = await renderInk(
      React.createElement(InkTable, {
        headers: ['Namespace', 'PID', 'Uptime', 'Log File'],
        rows,
      })
    )
    activeLogger.raw(tableOutput)
  }

  // Show message if nothing running
  if (cliProcesses.length === 0 && monitorRunning.length === 0) {
    activeLogger.raw(chalk.gray('No loops currently running'))
    activeLogger.raw('')
  }

  if (namespaces.length > 0) {
    activeLogger.raw('')
    activeLogger.raw(chalk.bold('All Namespaces:'))

    const rows = namespaces.map(ns => {
      const isRunning = ns.status === 'running' || cliProcesses.some(p => p.namespace === ns.name)
      const icon = isRunning ? chalk.green(getEmoji('●')) : chalk.gray(getEmoji('○'))
      const lastRunDisplay = ns.lastRun ? chalk.gray(ns.lastRun) : chalk.gray('-')

      return [
        icon,
        ns.name,
        lastRunDisplay,
      ]
    })

    const tableOutput = await renderInk(
      React.createElement(InkTable, {
        headers: ['', 'Namespace', 'Last Run'],
        rows,
      })
    )
    activeLogger.raw(tableOutput)
  }

  activeLogger.raw('')
}
