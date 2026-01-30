import { LoopworkMonitor } from '../monitor'
import { logger as defaultLogger } from '../core/utils'
import { LoopworkError, handleError as defaultHandleError } from '../core/errors'
import { loadRestartArgs as defaultLoadRestartArgs, findProjectRoot as defaultFindProjectRoot } from './shared/process-utils'

// ============================================================================
// INTERFACES - Dependency Inversion Principle
// Commands depend on abstractions (interfaces), not concrete implementations
// ============================================================================

/** Interface for process running state */
export interface IRunningProcess {
  namespace: string
  pid: number
  startedAt: string
  logFile: string
  args: string[]
}

/** Interface for monitor operations */
export interface IMonitor {
  getRunningProcesses(): IRunningProcess[]
  stop(namespace: string): { success: boolean; error?: string }
  start(namespace: string, args: string[]): Promise<{ success: boolean; pid?: number; error?: string }>
}

/** Interface for monitor class constructor */
export interface IMonitorConstructor {
  new (projectRoot: string): IMonitor
}

/** Interface for logger operations */
export interface ILogger {
  info(message: string): void
  success(message: string): void
  warn(message: string): void
  error(message: string): void
  debug(message: string): void
}

/** Interface for saved restart arguments */
export interface ISavedRestartArgs {
  namespace: string
  args: string[]
  cwd: string
  startedAt: string
}

/** Interface for error handler */
export type IErrorHandler = (error: Error) => void

/** Interface for loading restart args */
export type ILoadRestartArgs = (projectRoot: string, namespace: string) => ISavedRestartArgs | null

/** Interface for finding project root */
export type IFindProjectRoot = () => string

/** Interface for process operations */
export interface IProcess {
  exit(code: number): never
  kill(pid: number, signal?: number | NodeJS.Signals): boolean
  stdout: { write(chunk: string): boolean }
}

/** Dependencies interface - allows injection of all dependencies */
export interface RestartDeps {
  MonitorClass?: IMonitorConstructor
  logger?: ILogger
  handleError?: IErrorHandler
  loadRestartArgs?: ILoadRestartArgs
  findProjectRoot?: IFindProjectRoot
  process?: IProcess
  waitForProcessExit?: (pid: number, timeoutMs?: number) => Promise<boolean>
}

// Default implementations resolver
function resolveDeps(deps: RestartDeps = {}): Required<Omit<RestartDeps, 'waitForProcessExit'>> & Pick<RestartDeps, 'waitForProcessExit'> {
  return {
    MonitorClass: deps.MonitorClass ?? (LoopworkMonitor as unknown as IMonitorConstructor),
    logger: deps.logger ?? defaultLogger,
    handleError: deps.handleError ?? defaultHandleError,
    loadRestartArgs: deps.loadRestartArgs ?? defaultLoadRestartArgs,
    findProjectRoot: deps.findProjectRoot ?? defaultFindProjectRoot,
    process: deps.process ?? (process as unknown as IProcess),
    waitForProcessExit: deps.waitForProcessExit,
  }
}

export interface RestartOptions {
  namespace?: string
}

/**
 * Wait for a process to exit by polling process.kill(pid, 0)
 *
 * @param pid - Process ID to check
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000)
 * @param proc - Process interface for dependency injection
 * @returns true if process exited, false if timeout
 */
async function defaultWaitForProcessExit(
  pid: number,
  timeoutMs: number = 10000,
  proc: IProcess = process as unknown as IProcess
): Promise<boolean> {
  const startTime = Date.now()
  const pollIntervalMs = 100 // Poll every 100ms

  while (Date.now() - startTime < timeoutMs) {
    try {
      // process.kill(pid, 0) throws if process doesn't exist
      proc.kill(pid, 0)
      // Process still exists, wait and try again
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    } catch (error: unknown) {
      // ESRCH means "No such process" - it has exited
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ESRCH') {
        return true
      }
      // Other errors (EPERM, etc.) mean process might still exist
      // Continue polling
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    }
  }

  // Timeout reached
  return false
}

/**
 * Restart command - stop and restart a daemon with saved arguments
 *
 * Requires the namespace to have been previously started with 'loopwork start -d'.
 * Uses the saved arguments from the original start command.
 *
 * @param options - Restart options
 * @param deps - Injectable dependencies (for testing)
 */
export async function restart(options: RestartOptions = {}, deps: RestartDeps = {}): Promise<void> {
  const {
    MonitorClass,
    logger,
    handleError,
    loadRestartArgs,
    findProjectRoot,
    process: proc,
    waitForProcessExit,
  } = resolveDeps(deps)

  const projectRoot = findProjectRoot()
  const namespace = options.namespace || 'default'
  const monitor = new MonitorClass(projectRoot)

  // Load saved restart args
  const savedArgs = loadRestartArgs(projectRoot, namespace)

  if (!savedArgs) {
    handleError(new LoopworkError(
      `No saved arguments found for namespace '${namespace}'`,
      [
        `This namespace hasn't been started in daemon mode before`,
        `Use 'loopwork start -d --namespace ${namespace}' to start it first`,
        `Check available namespaces: loopwork status`
      ]
    ))
    proc.exit(1)
  }

  logger.info(`Restarting namespace '${namespace}' with saved arguments...`)
  logger.debug(`Args: ${savedArgs.args.join(' ')}`)

  // Stop if running
  const running = monitor.getRunningProcesses()
  const existing = running.find(p => p.namespace === namespace)

  if (existing) {
    logger.info(`Stopping existing process (PID: ${existing.pid})...`)
    const stopResult = monitor.stop(namespace)
    if (!stopResult.success) {
      handleError(new LoopworkError(
        `Failed to stop existing process: ${stopResult.error}`,
        [
          'Check if you have permissions to kill the process',
          `Manually kill the process: kill ${existing.pid}`,
          'Check if the process is stuck or unresponsive'
        ]
      ))
      proc.exit(1)
    }
    logger.success('Stopped')

    // Wait for process to actually exit (poll with timeout)
    const waitFn = waitForProcessExit ?? ((pid: number, timeout?: number) => defaultWaitForProcessExit(pid, timeout, proc))
    const exitWaitSuccess = await waitFn(existing.pid, 10000)
    if (!exitWaitSuccess) {
      handleError(new LoopworkError(
        `Process ${existing.pid} did not exit within 10 seconds`,
        [
          'The process may be stuck or unresponsive',
          `Try forcefully killing it: kill -9 ${existing.pid}`,
          'Check system logs for issues preventing graceful shutdown'
        ]
      ))
      proc.exit(1)
    }
  }

  // Start with saved args
  logger.info('Starting...')
  const startResult = await monitor.start(namespace, savedArgs.args)

  if (startResult.success) {
    logger.success(`Restarted (PID: ${startResult.pid})`)
    proc.stdout.write('\n')
    logger.info('Useful commands:')
    logger.info(`  View logs:    loopwork logs ${namespace}`)
    logger.info(`  Status:       loopwork status`)
    logger.info(`  Stop:         loopwork stop ${namespace}`)
    proc.stdout.write('\n')
  } else {
    handleError(new LoopworkError(
      `Failed to restart daemon: ${startResult.error}`,
      [
        'Check if another process is using the same port',
        'Verify you have permissions to create files in the project directory',
        'Check system resources (disk space, memory)',
        'Review the error message above for specific details'
      ]
    ))
    proc.exit(1)
  }
}

/**
 * Create the restart command configuration for CLI registration
 */
export function createRestartCommand() {
  return {
    name: 'restart',
    description: 'Restart a daemon with its saved arguments',
    usage: '[namespace]',
    examples: [
      { command: 'loopwork restart', description: 'Restart default namespace' },
      { command: 'loopwork restart prod', description: 'Restart prod namespace' },
    ],
    seeAlso: [
      'loopwork start     Start a new daemon',
      'loopwork kill      Stop a running daemon',
      'loopwork status    Check running processes',
    ],
    handler: restart,
  }
}
