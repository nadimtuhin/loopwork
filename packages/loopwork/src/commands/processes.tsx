import React from 'react'
import { LoopworkMonitor } from '../monitor'
import { logger, InkTable, renderInk } from '../core/utils'
import { findProjectRoot, formatUptime } from './shared/process-utils'
import { detectOrphans } from '../core/orphan-detector'
import { OrphanKiller } from '../core/orphan-killer'
import { LoopworkError } from '../core/errors'

export interface ProcessesListOptions {
  json?: boolean
  namespace?: string
}

export interface ProcessesCleanOptions {
  force?: boolean
  dryRun?: boolean
  json?: boolean
}

type ProcessesDeps = {
  MonitorClass?: typeof LoopworkMonitor
  logger?: typeof logger
  findProjectRoot?: typeof findProjectRoot
  detectOrphans?: typeof detectOrphans
  OrphanKillerClass?: typeof OrphanKiller
  LoopworkErrorClass?: typeof LoopworkError
}

/**
 * Format age in milliseconds to human-readable string
 */
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m`
  } else {
    return `${seconds}s`
  }
}

/**
 * List all tracked loopwork processes
 */
export async function list(options: ProcessesListOptions = {}, deps: ProcessesDeps = {}): Promise<void> {
  const monitorClass = deps.MonitorClass ?? LoopworkMonitor
  const activeLogger = deps.logger ?? logger
  const projectRoot = (deps.findProjectRoot ?? findProjectRoot)()

  const monitor = new monitorClass(projectRoot)
  const running = monitor.getRunningProcesses()

  // Filter by namespace if specified
  const filtered = options.namespace
    ? running.filter(p => p.namespace === options.namespace)
    : running

  if (options.json) {
    // JSON output mode
    const output = filtered.map(proc => ({
      namespace: proc.namespace,
      pid: proc.pid,
      startedAt: proc.startedAt,
      uptime: formatUptime(proc.startedAt),
      logFile: proc.logFile,
      args: proc.args,
    }))

    activeLogger.raw(JSON.stringify(output, null, 2))
    return
  }

  // Table output mode
  if (filtered.length === 0) {
    activeLogger.info('No loopwork processes running')
    return
  }

  activeLogger.info(`Loopwork Processes (${filtered.length} running)\n`)

  const tableOutput = await renderInk(
    <InkTable
      headers={['Namespace', 'PID', 'Uptime', 'Started At']}
      columnConfigs={[
        { width: 20, align: 'left' },
        { width: 8, align: 'right' },
        { width: 12, align: 'right' },
        { width: 19, align: 'left' },
      ]}
      rows={filtered.map(proc => [
        proc.namespace,
        proc.pid.toString(),
        formatUptime(proc.startedAt),
        new Date(proc.startedAt).toISOString().slice(0, 19)
      ])}
    />
  )

  activeLogger.raw(tableOutput)
  activeLogger.raw('')
}

/**
 * Clean orphan processes
 *
 * By default, only kills orphans confirmed to be from loopwork.
 * Use --force to also kill suspected orphans.
 */
export async function clean(options: ProcessesCleanOptions = {}, deps: ProcessesDeps = {}): Promise<void> {
  const activeLogger = deps.logger ?? logger
  const projectRoot = (deps.findProjectRoot ?? findProjectRoot)()
  const detectOrphansFunc = deps.detectOrphans ?? detectOrphans
  const OrphanKillerClass = deps.OrphanKillerClass ?? OrphanKiller

  if (!options.json) {
    activeLogger.info('Scanning for orphan processes...')
  }

  const orphans = await detectOrphansFunc({ projectRoot })

  if (orphans.length === 0) {
    if (options.json) {
      activeLogger.raw(
        JSON.stringify(
          {
            orphans: [],
            summary: { killed: 0, skipped: 0, failed: 0 },
          },
          null,
          2
        )
      )
    } else {
      activeLogger.success('No orphan processes found')
    }
    return
  }

  // JSON output mode
  if (options.json) {
    const killer = new OrphanKillerClass()
    const result = await killer.kill(orphans, {
      force: options.force,
      dryRun: options.dryRun,
      silent: true,
    })

    const output = {
      orphans: orphans.map(o => ({
        pid: o.pid,
        command: o.command,
        age: formatAge(o.age),
        ageMs: o.age,
        classification: o.classification,
        reason: o.reason,
        cwd: o.cwd,
        action:
          result.killed.includes(o.pid) ? 'killed' : result.skipped.includes(o.pid) ? 'skipped' : 'failed',
      })),
      summary: {
        killed: result.killed.length,
        skipped: result.skipped.length,
        failed: result.failed.length,
      },
      failures: result.failed.map(f => ({
        pid: f.pid,
        error: f.error,
      })),
    }

    activeLogger.raw(JSON.stringify(output, null, 2))
    return
  }

  // Table output mode
  activeLogger.info('\nOrphan Processes Found:\n')

  const killer = new OrphanKillerClass()
  const result = await killer.kill(orphans, {
    force: options.force,
    dryRun: options.dryRun,
  })

  const tableOutput = await renderInk(
    <InkTable
      headers={['PID', 'Command', 'Age', 'Status', 'Action']}
      columnConfigs={[
        { width: 5, align: 'right' },
        { width: 39, align: 'left' },
        { width: 6, align: 'right' },
        { width: 10, align: 'left' },
        { width: 9, align: 'left' },
      ]}
      rows={orphans.map(orphan => {
        let action: string
        if (result.killed.includes(orphan.pid)) {
          action = options.dryRun ? 'would kill' : 'killed'
        } else if (result.skipped.includes(orphan.pid)) {
          action = 'skipped'
        } else {
          action = 'failed'
        }
        return [
          orphan.pid.toString(),
          orphan.command.substring(0, 39),
          formatAge(orphan.age),
          orphan.classification,
          action
        ]
      })}
    />
  )

  activeLogger.raw(tableOutput)

  // Summary
  activeLogger.raw('')
  if (options.dryRun) {
    activeLogger.info(`Dry-run: Would kill ${result.killed.length}, skip ${result.skipped.length}`)
  } else {
    activeLogger.success(`Killed: ${result.killed.length}, Skipped: ${result.skipped.length}`)
  }

  if (result.failed.length > 0) {
    activeLogger.error(`Failed: ${result.failed.length}`)
    result.failed.forEach(f => {
      activeLogger.error(`  PID ${f.pid}: ${f.error}`)
    })
  }

  const suspectedCount = orphans.filter(o => o.classification === 'suspected').length
  if (suspectedCount > 0 && !options.force && !options.dryRun) {
    activeLogger.warn(`\nUse --force to also kill ${suspectedCount} suspected orphan(s)`)
  }

  activeLogger.raw('')
}

/**
 * Create the processes command configuration for CLI registration
 */
export function createProcessesCommand() {
  return {
    name: 'processes',
    description: 'Manage loopwork processes',
    usage: '<subcommand> [options]',
    subcommands: [
      {
        name: 'list',
        description: 'List all running loopwork processes',
        examples: [
          { command: 'loopwork processes list', description: 'Show all running processes' },
          { command: 'loopwork processes list --namespace prod', description: 'Filter by namespace' },
          { command: 'loopwork processes list --json', description: 'Output as JSON' },
        ],
      },
      {
        name: 'clean',
        description: 'Clean up orphan processes',
        examples: [
          { command: 'loopwork processes clean', description: 'Kill confirmed orphans' },
          { command: 'loopwork processes clean --force', description: 'Kill all orphans including suspected' },
          { command: 'loopwork processes clean --dry-run', description: 'Preview without killing' },
          { command: 'loopwork processes clean --json', description: 'Output results as JSON' },
        ],
      },
    ],
    handler: {
      list,
      clean,
    },
  }
}
