import { logger } from '../core/utils'
import { LoopworkMonitor } from '../monitor'
import { findProjectRoot } from './shared/process-utils'
import { LoopworkError } from '../core/errors'
import { detectOrphans } from '../core/orphan-detector'
import { OrphanKiller } from '../core/orphan-killer'

export interface KillOptions {
  all?: boolean
  namespace?: string
  orphans?: boolean
  dryRun?: boolean
  force?: boolean
  json?: boolean
}

type KillDeps = {
  MonitorClass?: typeof LoopworkMonitor
  logger?: typeof logger
  findProjectRoot?: typeof findProjectRoot
  LoopworkErrorClass?: typeof LoopworkError
  detectOrphans?: typeof detectOrphans
  OrphanKillerClass?: typeof OrphanKiller
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
 * Kill (stop) a running loopwork daemon process
 *
 * Sends SIGTERM to gracefully shut down the process.
 * Use --all to stop all running namespaces.
 * Use --orphans to find and kill orphan processes.
 */
export async function kill(options: KillOptions = {}, deps: KillDeps = {}): Promise<void> {
  const monitorClass = deps.MonitorClass ?? LoopworkMonitor
  const activeLogger = deps.logger ?? logger
  const resolveProjectRoot = deps.findProjectRoot ?? findProjectRoot
  const ErrorClass = deps.LoopworkErrorClass ?? LoopworkError
  const detectOrphansFunc = deps.detectOrphans ?? detectOrphans
  const OrphanKillerClass = deps.OrphanKillerClass ?? OrphanKiller
  const projectRoot = resolveProjectRoot()

  // Handle orphan management
  if (options.orphans) {
    activeLogger.info('Scanning for orphan processes...')

    const orphans = await detectOrphansFunc({ projectRoot })

    if (orphans.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ orphans: [], summary: { killed: 0, skipped: 0, failed: 0 } }, null, 2))
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
          action: result.killed.includes(o.pid) ? 'killed' :
                 result.skipped.includes(o.pid) ? 'skipped' : 'failed'
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

      console.log(JSON.stringify(output, null, 2))
      return
    }

    // Table output mode
    activeLogger.info(`\nOrphan Processes Found:`)
    console.log('┌───────┬─────────────────────────────────────────┬────────┬────────────┬─────────┐')
    console.log('│  PID  │              Command                    │  Age   │   Status   │ Action  │')
    console.log('├───────┼─────────────────────────────────────────┼────────┼────────────┼─────────┤')

    const killer = new OrphanKillerClass()
    const result = await killer.kill(orphans, {
      force: options.force,
      dryRun: options.dryRun,
    })

    for (const orphan of orphans) {
      const pid = orphan.pid.toString().padEnd(5)
      const command = orphan.command.substring(0, 39).padEnd(39)
      const age = formatAge(orphan.age).padEnd(6)
      const status = orphan.classification.padEnd(10)

      let action: string
      if (result.killed.includes(orphan.pid)) {
        action = options.dryRun ? 'would kill' : 'killed'
      } else if (result.skipped.includes(orphan.pid)) {
        action = 'skipped'
      } else {
        action = 'failed'
      }
      action = action.padEnd(7)

      console.log(`│ ${pid} │ ${command} │ ${age} │ ${status} │ ${action} │`)
    }

    console.log('└───────┴─────────────────────────────────────────┴────────┴────────────┴─────────┘')

    // Summary
    const _confirmedCount = orphans.filter(o => o.classification === 'confirmed').length
    const suspectedCount = orphans.filter(o => o.classification === 'suspected').length

    let summary = `\nSummary: `
    if (options.dryRun) {
      summary += `Would kill ${result.killed.length} orphan(s)`
    } else {
      summary += `Killed ${result.killed.length} orphan(s)`
    }

    if (result.skipped.length > 0) {
      summary += `, skipped ${result.skipped.length}`
    }
    if (result.failed.length > 0) {
      summary += `, failed ${result.failed.length}`
    }

    activeLogger.info(summary)

    if (suspectedCount > 0 && !options.force && !options.dryRun) {
      activeLogger.info(`\nTip: Use --force to also kill ${suspectedCount} suspected orphan(s)`)
    }

    return
  }

  // Original namespace-based killing
  const monitor = new monitorClass(projectRoot)

  if (options.all) {
    // Kill all running processes
    const result = monitor.stopAll()

    if (result.stopped.length > 0) {
      activeLogger.success(`Stopped: ${result.stopped.join(', ')}`)
    }
    if (result.errors.length > 0) {
      result.errors.forEach(err => activeLogger.error(err))
    }
    if (result.stopped.length === 0 && result.errors.length === 0) {
      activeLogger.info('No running processes to stop')
    }
  } else {
    // Kill specific namespace
    const ns = options.namespace || 'default'
    const result = monitor.stop(ns)

    if (result.success) {
      activeLogger.success(`Stopped namespace '${ns}'`)
    } else {
      throw new ErrorClass(
        result.error || 'Failed to stop',
        [
          `Check if namespace '${ns}' is actually running: loopwork status`,
          'Ensure you have permissions to kill the process',
          `Manual stop: kill <PID>`
        ]
      )
    }
  }
}

/**
 * Create the kill command configuration for CLI registration
 */
export function createKillCommand() {
  return {
    name: 'kill',
    description: 'Stop a running loopwork daemon process or clean up orphans',
    aliases: ['stop'],
    usage: '[namespace] [options]',
    examples: [
      { command: 'loopwork kill', description: 'Stop default namespace' },
      { command: 'loopwork kill prod', description: 'Stop prod namespace' },
      { command: 'loopwork kill --all', description: 'Stop all running namespaces' },
      { command: 'loopwork kill --orphans', description: 'Find and kill orphan processes' },
      { command: 'loopwork kill --orphans --dry-run', description: 'Preview orphans without killing' },
      { command: 'loopwork kill --orphans --force', description: 'Kill all orphans including suspected' },
      { command: 'loopwork kill --orphans --json', description: 'Output orphan results as JSON' },
      { command: 'loopwork stop', description: 'Alias for kill command' },
    ],
    seeAlso: [
      'loopwork start     Start a daemon',
      'loopwork restart   Restart with saved arguments',
      'loopwork status    Check running processes',
    ],
    handler: kill,
  }
}
