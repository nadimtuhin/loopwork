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
export interface UpDeps {
  MonitorClass?: typeof LoopworkMonitor
  findProjectRoot?: typeof defaultFindProjectRoot
  saveRestartArgs?: typeof saveRestartArgs
  logger?: typeof defaultLogger
  handleError?: typeof defaultHandleError
  runCommand?: (options: RunCommandOptions) => Promise<void>
  process?: NodeJS.Process
}

function resolveDeps(deps: UpDeps = {}) {
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

export interface UpOptions {
  namespace?: string
  /** Detached mode - run in background like Docker Compose -d */
  detach?: boolean
  detached?: boolean
  d?: boolean
  tail?: boolean
  follow?: boolean
  lines?: number
  cleanOrphans?: boolean
  'clean-orphans'?: boolean
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
  checkpoint?: string
  resume?: boolean
  withAIMonitor?: boolean
  'with-ai-monitor'?: boolean
  dynamicTasks?: boolean
  'no-dynamic-tasks'?: boolean
  reducedFunctionality?: boolean
  flag?: string[]
  parallel?: number | boolean
  sequential?: boolean
  json?: boolean
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
  checkpoint?: string
  resume?: boolean
  withAIMonitor?: boolean
  dynamicTasks?: boolean
  reducedFunctionality?: boolean
  flag?: string[]
  parallel?: number | boolean
  sequential?: boolean
  json?: boolean
  [key: string]: unknown
}

/**
 * Up command - Docker Compose-style unified interface
 *
 * Foreground mode (default): Runs directly in terminal
 * Detached mode (-d): Runs in background
 *
 * This is the primary command for starting Loopwork.
 * Think of it like `docker compose up` vs `docker compose up -d`
 */
export async function up(options: UpOptions = {}, deps: UpDeps = {}): Promise<void> {
  const { findProjectRoot, runCommand, logger } = resolveDeps(deps)
  const projectRoot = findProjectRoot()
  const namespace = options.namespace || 'default'
  const shouldCleanOrphans = options.cleanOrphans || options['clean-orphans']
  const isDetached = options.detach || options.detached || options.d

  // Clean orphans before starting if requested
  if (shouldCleanOrphans) {
    logger.info('Cleaning up orphan processes...')
    try {
      const { clean } = await import('./processes')
      await clean({ force: false, dryRun: false })
      logger.raw('')
    } catch (err) {
      logger.warn(`Failed to clean orphans: ${err}`)
    }
  }

  // Build args to pass through to the run command
  const passThoughArgs = buildPassThroughArgs(options)

  if (isDetached) {
    await startDetached(projectRoot, namespace, passThoughArgs, options, deps)
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
 * Start loopwork in detached (background) mode
 */
async function startDetached(
  projectRoot: string,
  namespace: string,
  args: string[],
  options: UpOptions,
  deps: UpDeps = {}
): Promise<void> {
  const { MonitorClass, saveRestartArgs, logger, handleError, process: proc } = resolveDeps(deps)
  const monitor = new MonitorClass(projectRoot)

  // Check if already running
  const running = monitor.getRunningProcesses()
  const existing = running.find(p => p.namespace === namespace)

  if (existing) {
    throw new LoopworkError(
      'ERR_PROCESS_SPAWN',
      `Namespace '${namespace}' is already running (PID: ${existing.pid})`,
      [
        `Use 'loopwork down ${namespace}' to stop it first`,
        `Or use 'loopwork logs ${namespace}' to view logs`,
        'Use a different namespace with --namespace <name>'
      ]
    )
  }

  logger.info(`Starting loopwork in detached mode (namespace: '${namespace}')...`)

  // Save restart args for potential restart
  saveRestartArgs(projectRoot, namespace, args)

  const result = await monitor.start(namespace, args)

  if (result.success) {
    logger.success(`Loopwork is up and running in detached mode`)
    logger.raw('')
    logger.info(`  PID:       ${result.pid}`)
    logger.info(`  Namespace: ${namespace}`)
    if (result.sessionId) {
      logger.info(`  Session:   ${result.sessionId}`)
    }
    logger.raw('')
    logger.info('Useful commands:')
    logger.info(`  ${chalk.cyan('loopwork logs ' + namespace)}       View logs`)
    logger.info(`  ${chalk.cyan('loopwork logs ' + namespace + ' -f')}    Follow logs`)
    logger.info(`  ${chalk.cyan('loopwork ps')}                  Show running processes`)
    logger.info(`  ${chalk.cyan('loopwork down ' + namespace)}      Stop this process`)
    logger.raw('')

    // Optionally tail logs after starting
    if (options.tail || options.follow) {
      await tailDetachedLogs(projectRoot, namespace, options.lines || 20)
    }
  } else {
    handleError(new LoopworkError(
      'ERR_MONITOR_START',
      `Failed to start in detached mode: ${result.error}`,
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
 * Tail detached logs in real-time
 */
async function tailDetachedLogs(
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
function buildPassThroughArgs(options: UpOptions): string[] {
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
  if (options.checkpoint) args.push('--checkpoint', options.checkpoint)
  if (options.resume) args.push('--resume')
  if (options.withAIMonitor || options['with-ai-monitor']) args.push('--with-ai-monitor')
  if (options.reducedFunctionality) args.push('--reduced-functionality')
  if (options.parallel) {
    if (typeof options.parallel === 'number') {
      args.push('--parallel', String(options.parallel))
    } else {
      args.push('--parallel')
    }
  }
  if (options.sequential) args.push('--sequential')
  if (options.json) args.push('--json')

  if (options.flag && Array.isArray(options.flag)) {
    options.flag.forEach(f => args.push('--flag', f))
  }

  return args
}

/**
 * Build options object for run command
 */
function buildRunOptions(options: UpOptions): RunCommandOptions {
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
  if (options.checkpoint) runOptions.checkpoint = options.checkpoint
  if (options.resume) runOptions.resume = options.resume
  if (options.withAIMonitor || options['with-ai-monitor']) runOptions.withAIMonitor = true
  if (options.dynamicTasks === false || options['no-dynamic-tasks']) runOptions.dynamicTasks = false
  if (options.reducedFunctionality) runOptions.reducedFunctionality = true
  if (options.flag) runOptions.flag = options.flag
  if (options.parallel) runOptions.parallel = options.parallel
  if (options.sequential) runOptions.sequential = options.sequential
  if (options.json) runOptions.json = options.json

  return runOptions
}

/**
 * Create the up command configuration for CLI registration
 */
export function createUpCommand() {
  return {
    name: 'up',
    description: 'Start Loopwork (Docker Compose-style)',
    usage: '[options]',
    examples: [
      { command: 'loopwork up', description: 'Start in foreground (attached)' },
      { command: 'loopwork up -d', description: 'Start in background (detached)' },
      { command: 'loopwork up -d --namespace prod', description: 'Start with custom namespace' },
      { command: 'loopwork up -d --tail', description: 'Start and follow logs' },
      { command: 'loopwork up --resume', description: 'Resume from saved state' },
      { command: 'loopwork up --feature auth', description: 'Process only auth-tagged tasks' },
      { command: 'loopwork up --parallel 3', description: 'Run with 3 parallel workers' },
    ],
    seeAlso: [
      'loopwork down      Stop running processes',
      'loopwork ps        List running processes',
      'loopwork logs      View logs',
    ],
    handler: up,
  }
}
