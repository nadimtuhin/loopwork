import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'
import { logger as defaultLogger } from '../core/utils'
import { LoopworkError, handleError as defaultHandleError } from '../core/errors'
import { findProjectRoot as defaultFindProjectRoot } from './shared/process-utils'

// Dependency injection interface for testing
export interface DownDeps {
  MonitorClass?: typeof LoopworkMonitor
  findProjectRoot?: typeof defaultFindProjectRoot
  logger?: typeof defaultLogger
  handleError?: typeof defaultHandleError
  process?: NodeJS.Process
}

function resolveDeps(deps: DownDeps = {}) {
  return {
    MonitorClass: deps.MonitorClass ?? LoopworkMonitor,
    findProjectRoot: deps.findProjectRoot ?? defaultFindProjectRoot,
    logger: deps.logger ?? defaultLogger,
    handleError: deps.handleError ?? defaultHandleError,
    process: deps.process ?? process,
  }
}

export interface DownOptions {
  namespace?: string
  /** Stop all running processes */
  all?: boolean
  /** Force stop (SIGKILL instead of SIGTERM) */
  force?: boolean
  /** Timeout in seconds to wait for graceful shutdown */
  timeout?: number
  /** Remove session data (like docker compose down --volumes) */
  volumes?: boolean
  v?: boolean
}

/**
 * Down command - Docker Compose-style stop interface
 *
 * Stops running Loopwork processes gracefully.
 * Think of it like `docker compose down`
 */
export async function down(options: DownOptions = {}, deps: DownDeps = {}): Promise<void> {
  const { MonitorClass, findProjectRoot, logger, handleError, process: proc } = resolveDeps(deps)
  const projectRoot = findProjectRoot()
  const monitor = new MonitorClass(projectRoot)

  // Get namespace from options
  const namespace = options.namespace

  if (options.all) {
    // Stop all running processes
    const result = monitor.stopAll()

    if (result.stopped.length > 0) {
      logger.success(`Stopped ${result.stopped.length} process(es):`)
      result.stopped.forEach(ns => {
        logger.info(`  ${chalk.green('✓')} ${ns}`)
      })
    }

    if (result.errors.length > 0) {
      logger.warn('Some processes failed to stop:')
      result.errors.forEach(err => {
        logger.error(`  ${err}`)
      })
    }

    if (result.stopped.length === 0 && result.errors.length === 0) {
      logger.info('No running processes to stop')
    }

    return
  }

  // Stop specific namespace
  const ns = namespace || 'default'

  // Check if running
  const running = monitor.getRunningProcesses()
  const existing = running.find(p => p.namespace === ns)

  if (!existing) {
    logger.info(`No running process found for namespace '${ns}'`)
    logger.raw('')
    logger.info('Running processes:')
    if (running.length === 0) {
      logger.info('  (none)')
    } else {
      running.forEach(p => {
        logger.info(`  ${chalk.green('●')} ${p.namespace} (PID: ${p.pid})`)
      })
    }
    logger.raw('')
    logger.info(`Use ${chalk.cyan('loopwork down --all')} to stop all processes`)
    return
  }

  logger.info(`Stopping namespace '${ns}' (PID: ${existing.pid})...`)

  const result = monitor.stop(ns)

  if (result.success) {
    logger.success(`Stopped namespace '${ns}'`)

    // Optionally clean up session data
    if (options.volumes || options.v) {
      logger.info('Cleaning up session data...')
      // Note: This is a placeholder - we could add cleanup logic here
      // For now, we just leave the logs for debugging
      logger.info('Session logs preserved for debugging')
    }
  } else {
    handleError(new LoopworkError(
      'ERR_PROCESS_KILL',
      result.error || 'Failed to stop process',
      [
        `Check if namespace '${ns}' is actually running: loopwork ps`,
        'Ensure you have permissions to kill the process',
        `Manual stop: kill ${existing.pid}`,
        `Force stop: kill -9 ${existing.pid}`
      ]
    ))
    proc.exit(1)
  }
}

/**
 * Create the down command configuration for CLI registration
 */
export function createDownCommand() {
  return {
    name: 'down',
    description: 'Stop running Loopwork processes (Docker Compose-style)',
    usage: '[namespace] [options]',
    examples: [
      { command: 'loopwork down', description: 'Stop the default namespace' },
      { command: 'loopwork down prod', description: 'Stop the prod namespace' },
      { command: 'loopwork down --all', description: 'Stop all running processes' },
    ],
    seeAlso: [
      'loopwork up        Start Loopwork',
      'loopwork ps        List running processes',
      'loopwork logs      View logs',
    ],
    handler: down,
  }
}
