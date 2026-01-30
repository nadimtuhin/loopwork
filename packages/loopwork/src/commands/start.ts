import chalk from 'chalk'
import { LoopworkMonitor } from '../monitor'
import { logger as defaultLogger } from '../core/utils'
import { LoopworkError, handleError as defaultHandleError } from '../core/errors'
import {
  findLatestSession,
  tailLogs,
  formatLogLine,
  getMainLogFile,
  readLastLines,
} from './shared/log-utils'
import {
  saveRestartArgs,
  formatUptime,
  findProjectRoot as defaultFindProjectRoot,
} from './shared/process-utils'

// Dependency injection interface for testing
export interface StartDeps {
  MonitorClass?: typeof LoopworkMonitor
  findProjectRoot?: typeof defaultFindProjectRoot
  saveRestartArgs?: typeof saveRestartArgs
  logger?: typeof defaultLogger
  handleError?: typeof defaultHandleError
  runCommand?: (options: RunCommandOptions) => Promise<void>
  process?: NodeJS.Process
}

function resolveDeps(deps: StartDeps = {}) {
  return {
    MonitorClass: deps.MonitorClass ?? LoopworkMonitor,
    findProjectRoot: deps.findProjectRoot ?? defaultFindProjectRoot,
    saveRestartArgs: deps.saveRestartArgs ?? saveRestartArgs,
    logger: deps.logger ?? defaultLogger,
    handleError: deps.handleError ?? defaultHandleError,
    runCommand: deps.runCommand,
    process: deps.process ?? process,
  }
}

export interface StartOptions {
  namespace?: string
  daemon?: boolean
  tail?: boolean
  follow?: boolean
  lines?: number
  // Pass through to run command
  feature?: string
  backend?: string
  tasksFile?: string
  repo?: string
  maxIterations?: number
  timeout?: number
  cli?: string
  model?: string
  dryRun?: boolean
  yes?: boolean
  debug?: boolean
  config?: string
}

export interface RunCommandOptions {
  namespace?: string
  feature?: string
  backend?: string
  tasksFile?: string
  repo?: string
  maxIterations?: number
  timeout?: number
  cli?: string
  model?: string
  dryRun?: boolean
  yes?: boolean
  debug?: boolean
  config?: string
}

/**
 * Start command - runs loopwork with optional daemon mode
 *
 * Foreground mode: Runs directly in terminal (default)
 * Daemon mode (-d): Runs in background, logs to file
 *
 * Supports all run command options plus daemon-specific options.
 */
export async function start(options: StartOptions = {}, deps: StartDeps = {}): Promise<void> {
  const { findProjectRoot, runCommand } = resolveDeps(deps)
  const projectRoot = findProjectRoot()
  const namespace = options.namespace || 'default'

  // Build args to pass through to the run command
  const passThoughArgs = buildPassThroughArgs(options)

  if (options.daemon) {
    await startDaemon(projectRoot, namespace, passThoughArgs, options, deps)
  } else {
    // Run in foreground - delegate to run command
    if (runCommand) {
      await runCommand(buildRunOptions(options))
    } else {
      const { run } = await import('./run')
      await run(buildRunOptions(options))
    }
  }
}

/**
 * Start loopwork as a background daemon
 */
async function startDaemon(
  projectRoot: string,
  namespace: string,
  args: string[],
  options: StartOptions,
  deps: StartDeps = {}
): Promise<void> {
  const { MonitorClass, saveRestartArgs, logger, handleError, process: proc } = resolveDeps(deps)
  const monitor = new MonitorClass(projectRoot)

  // Check if already running
  const running = monitor.getRunningProcesses()
  const existing = running.find(p => p.namespace === namespace)

  if (existing) {
    throw new LoopworkError(
      `Namespace '${namespace}' is already running (PID: ${existing.pid})`,
      [
        `Use 'loopwork stop ${namespace}' to stop it first`,
        `Or use 'loopwork logs ${namespace}' to view logs`,
        'Use a different namespace with --namespace <name>'
      ]
    )
  }

  logger.info(`Starting loopwork daemon in namespace '${namespace}'...`)

  // Save restart args for potential restart
  saveRestartArgs(projectRoot, namespace, args)

  const result = await monitor.start(namespace, args)

  if (result.success) {
    logger.success(`Daemon started (PID: ${result.pid})`)
    logger.raw('')
    logger.info('Useful commands:')
    logger.info(`  View logs:    loopwork logs ${namespace}`)
    logger.info(`  Tail logs:    loopwork logs ${namespace} --follow`)
    logger.info(`  Status:       loopwork status`)
    logger.info(`  Stop:         loopwork stop ${namespace}`)
    logger.raw('')

    // Optionally tail logs after starting
    if (options.tail || options.follow) {
      await tailDaemonLogs(projectRoot, namespace, options.lines || 20)
    }
  } else {
    handleError(new LoopworkError(
      `Failed to start daemon: ${result.error}`,
      [
        'Check if another process is using the same port',
        'Verify you have permissions to create files in the project directory',
        'Check system resources (disk space, memory)',
        'Review logs for more details: loopwork logs'
      ]
    ))
    proc.exit(1)
  }
}

/**
 * Tail daemon logs in real-time
 */
async function tailDaemonLogs(
  projectRoot: string,
  namespace: string,
  initialLines: number = 20
): Promise<void> {
  const logger = defaultLogger
  const monitor = new LoopworkMonitor(projectRoot)
  const running = monitor.getRunningProcesses()
  const proc = running.find(p => p.namespace === namespace)

  if (!proc) {
    // Try to find latest session logs
    const session = findLatestSession(projectRoot, namespace)
    if (session) {
      const logFile = getMainLogFile(session.fullPath)
      if (logFile) {
        logger.raw(chalk.gray(`\nTailing ${logFile}...`))
        logger.raw(chalk.gray('(Press Ctrl+C to stop)\n'))

        // Show initial lines
        const initial = readLastLines(logFile, initialLines)
        initial.forEach(line => {
          if (line.trim()) {
            logger.raw(formatLogLine(line))
          }
        })

        // Start tailing
        const { stop } = tailLogs(logFile, {
          onLine: (line) => {
            logger.raw(formatLogLine(line))
          },
        })

        // Handle Ctrl+C
        process.on('SIGINT', () => {
          stop()
          logger.raw('')
          process.exit(0)
        })

        // Keep process alive
        await new Promise(() => {})
      }
    }
    logger.warn(`No active logs found for namespace '${namespace}'`)
    return
  }

  logger.raw(chalk.gray(`\nTailing ${proc.logFile}...`))
  logger.raw(chalk.gray(`Started: ${proc.startedAt} (uptime: ${formatUptime(proc.startedAt)})`))
  logger.raw(chalk.gray('(Press Ctrl+C to stop)\n'))

  // Show initial lines
  const initial = readLastLines(proc.logFile, initialLines)
  initial.forEach(line => {
    if (line.trim()) {
      logger.raw(formatLogLine(line))
    }
  })

  // Start tailing
  const { stop } = tailLogs(proc.logFile, {
    onLine: (line) => {
      logger.raw(formatLogLine(line))
    },
  })

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    stop()
    logger.raw('')
    process.exit(0)
  })

  // Keep process alive
  await new Promise(() => {})
}

/**
 * Build args array to pass through to monitor/run
 */
function buildPassThroughArgs(options: StartOptions): string[] {
  const args: string[] = []

  if (options.feature) args.push('--feature', options.feature)
  if (options.backend) args.push('--backend', options.backend)
  if (options.tasksFile) args.push('--tasks-file', options.tasksFile)
  if (options.repo) args.push('--repo', options.repo)
  if (options.maxIterations) args.push('--max-iterations', String(options.maxIterations))
  if (options.timeout) args.push('--timeout', String(options.timeout))
  if (options.cli) args.push('--cli', options.cli)
  if (options.model) args.push('--model', options.model)
  if (options.dryRun) args.push('--dry-run')
  if (options.yes) args.push('--yes')
  if (options.debug) args.push('--debug')
  if (options.config) args.push('--config', options.config)

  return args
}

/**
 * Build options object for run command
 */
function buildRunOptions(options: StartOptions): RunCommandOptions {
  const runOptions: RunCommandOptions = {}

  if (options.namespace) runOptions.namespace = options.namespace
  if (options.feature) runOptions.feature = options.feature
  if (options.backend) runOptions.backend = options.backend
  if (options.tasksFile) runOptions.tasksFile = options.tasksFile
  if (options.repo) runOptions.repo = options.repo
  if (options.maxIterations) runOptions.maxIterations = options.maxIterations
  if (options.timeout) runOptions.timeout = options.timeout
  if (options.cli) runOptions.cli = options.cli
  if (options.model) runOptions.model = options.model
  if (options.dryRun) runOptions.dryRun = options.dryRun
  if (options.yes) runOptions.yes = options.yes
  if (options.debug) runOptions.debug = options.debug
  if (options.config) runOptions.config = options.config

  return runOptions
}

/**
 * Create the start command configuration for CLI registration
 */
export function createStartCommand() {
  return {
    name: 'start',
    description: 'Start Loopwork with optional daemon mode',
    usage: '[options]',
    examples: [
      { command: 'loopwork start', description: 'Start in foreground (default)' },
      { command: 'loopwork start -d', description: 'Start in background daemon mode' },
      { command: 'loopwork start -d --namespace prod', description: 'Start daemon with custom namespace' },
      { command: 'loopwork start -d --tail', description: 'Start daemon and tail logs' },
      { command: 'loopwork start --feature auth --resume', description: 'Resume auth tasks in foreground' },
    ],
    seeAlso: [
      'loopwork logs      View logs for a namespace',
      'loopwork kill      Stop a running daemon',
      'loopwork restart   Restart with saved arguments',
      'loopwork status    Check running processes',
    ],
    handler: start,
  }
}
