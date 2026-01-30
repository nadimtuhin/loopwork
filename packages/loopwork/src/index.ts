import { Command } from 'commander'
import { logger } from './core/utils'
import { handleError, LoopworkError } from './core/errors'
import packageJson from '../package.json'

// Export library API for use in config files
export {
  defineConfig,
  compose,
  withPlugin,
  withJSONBackend,
  withGitHubBackend,
  withClaudeCode,
  withIPC,
  withAIMonitor,
  withDynamicTasks,
  // CLI configuration
  withCli,
  withModels,
  withRetry,
  withCliPaths,
  withSelectionStrategy,
  createModel,
  ModelPresets,
  RetryPresets,
} from './plugins'
export type { LoopworkConfig, LoopworkPlugin, ConfigWrapper } from './contracts'
export type {
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliPathConfig,
  ModelSelectionStrategy,
  CliType,
} from './contracts'
export type { IPCMessage, IPCEventType, IPCPluginOptions, DynamicTasksOptions } from './plugins'
export type {
  AIMonitorConfig,
  MonitorState,
  RecoveryHistoryEntry,
} from './ai-monitor'

// Export analyzers for task analysis
export { PatternAnalyzer } from './analyzers'
export type { PatternAnalyzerConfig } from './analyzers'
export type { TaskAnalyzer, TaskAnalysisResult, SuggestedTask } from './contracts/analysis'

// Export centralized state management
export {
  LoopworkState,
  loopworkState,
  LOOPWORK_DIR,
  STATE_FILES,
  STATE_DIRS,
  STATE_WATCH_PATTERNS,
} from './core/loopwork-state'

// Legacy exports for backward compatibility (deprecated)
export {
  LOOPWORK_STATE_DIR,
  STATE_FILE_BASE,
  MONITOR_STATE_FILE,
  STATE_FILE_WATCH_PATTERNS,
} from './core/constants'

// Legacy args that should trigger auto-insertion of 'run' subcommand
const RUN_ARGS = [
  '--resume',
  '--dry-run',
  '--feature',
  '--task',
  '--max-iterations',
  '--timeout',
  '--cli',
  '--model',
  '--backend',
  '--repo',
  '--tasks-file',
  '--namespace',
  '--config',
  '--debug',
  '--parallel',
  '--sequential',
  '-y',
  '--yes',
]

/**
 * Check if args contain flags that should trigger 'run' command
 */
function shouldAutoInsertRun(args: string[]): boolean {
  // If first arg is a known subcommand, don't auto-insert
  const subcommands = ['run', 'init', 'start', 'stop', 'kill', 'status', 'logs', 'monitor', 'restart', 'dashboard', 'help', '--help', '-h', '--version', '-V', 'd', 'decompose', 'task-new']
  if (args.length > 0 && subcommands.includes(args[0])) {
    return false
  }

  // Check if any of the args match run-specific flags
  return args.some(arg => RUN_ARGS.some(runArg => arg === runArg || arg.startsWith(runArg + '=')))
}

// Only run CLI if this is the main module
if (import.meta.main) {
  async function main() {
    const program = new Command()

    program
      .name('loopwork')
      .description('AI-powered task automation framework')
      .version(packageJson.version)

    // Backward compatibility: auto-insert 'run' for legacy args
    const args = process.argv.slice(2)
    if (shouldAutoInsertRun(args)) {
      process.argv.splice(2, 0, 'run')
    }

    // Kill command (alias for stop, more intuitive name)
    program
      .command('kill [namespace]')
      .description('Kill a running loopwork process or clean up orphan processes')
      .option('--all', 'Kill all running processes')
      .option('--orphans', 'Scan for and kill orphan processes')
      .option('--dry-run', 'Preview orphans without killing them')
      .option('--force', 'Also kill suspected orphans (use with caution)')
      .option('--json', 'Output results as JSON')
      .action(async (namespace, options) => {
        try {
          const { kill } = await import('./commands/kill')
          await kill({
            namespace,
            all: options.all,
            orphans: options.orphans,
            dryRun: options.dryRun,
            force: options.force,
            json: options.json,
          })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Run command (default when flags are passed)
    program
      .command('run')
      .description('Run the task automation loop')
      .option('--backend <type>', 'Task backend: github or json')
      .option('--repo <owner/repo>', 'GitHub repository')
      .option('--tasks-file <path>', 'Path to tasks.json file')
      .option('--feature <name>', 'Filter by feature label')
      .option('--task <id>', 'Start from specific task ID')
      .option('--max-iterations <number>', 'Maximum iterations')
      .option('--timeout <seconds>', 'Timeout per task in seconds')
      .option('--cli <name>', 'CLI to use (opencode, claude, gemini)')
      .option('--model <id>', 'Specific model ID')
      .option('--resume', 'Resume from last saved state')
      .option('--dry-run', 'Show what would be done without executing')
      .option('-y, --yes', 'Non-interactive mode')
      .option('--debug', 'Enable debug logging')
      .option('--namespace <name>', 'Namespace for running multiple loops')
      .option('--config <path>', 'Path to config file')
      .option('--parallel [count]', 'Enable parallel execution (default: 2 workers)')
      .option('--sequential', 'Force sequential execution (parallel=1)')
      .option('--with-ai-monitor', 'Enable AI Monitor for auto-healing')
      .option('--json', 'Output as newline-delimited JSON events')
      .action(async (options) => {
        try {
          const { run } = await import('./commands/run')
          await run(options)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Task-new command
    program
      .command('task-new')
      .description('Create a new task in the backlog')
      .option('--title <title>', 'Task title')
      .option('--description <desc>', 'Task description')
      .option('--priority <level>', 'Priority (high, medium, low)', 'medium')
      .option('--feature <name>', 'Feature name')
      .action(async (options) => {
        try {
          const { taskNew } = await import('./commands/task-new')
          await taskNew(options)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Decompose command (shorthand: d)
    program
      .command('d <prompt>')
      .alias('decompose')
      .description('Decompose a prompt into tasks using AI')
      .option('--feature <name>', 'Feature label for the tasks')
      .option('--parent <id>', 'Parent task ID (creates sub-tasks)')
      .option('--priority <level>', 'Default priority: high, medium, low', 'medium')
      .option('--cli <name>', 'CLI to use: claude, opencode, gemini', 'claude')
      .option('--model <id>', 'Specific model to use')
      .option('--dry-run', 'Show what would be created without saving')
      .option('-y, --yes', 'Skip confirmation prompt')
      .option('--json', 'Output as JSON')
      .action(async (prompt, options) => {
        try {
          const { decompose } = await import('./commands/decompose')
          await decompose(prompt, options)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Monitor command with subcommands
    const monitorCmd = program
      .command('monitor')
      .description('Monitor and manage background loops')

    monitorCmd
      .command('start <namespace> [args...]')
      .description('Start a loop in daemon mode')
      .action(async (namespace, args) => {
        try {
          const { monitorStart } = await import('./commands/monitor')
          await monitorStart({ namespace, args })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    monitorCmd
      .command('stop <namespace>')
      .description('Stop a running loop')
      .action(async (namespace) => {
        try {
          const { monitorStop } = await import('./commands/monitor')
          await monitorStop(namespace)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    monitorCmd
      .command('status')
      .description('Show status of all loops')
      .action(async () => {
        try {
          const { monitorStatus } = await import('./commands/monitor')
          await monitorStatus()
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    monitorCmd
      .command('logs <namespace> [lines]')
      .description('View logs for a namespace')
      .option('-f, --follow', 'Follow log output')
      .action(async (namespace, lines, options) => {
        try {
          const { monitorLogs } = await import('./commands/monitor')
          await monitorLogs({
            namespace,
            lines: lines ? parseInt(lines, 10) : undefined,
            follow: options.follow,
          })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    monitorCmd
      .command('tail <namespace>')
      .description('Tail logs in real-time')
      .action(async (namespace) => {
        try {
          const { monitorTail } = await import('./commands/monitor')
          await monitorTail(namespace)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Restart command
    program
      .command('restart [namespace]')
      .description('Restart a loop with saved arguments')
      .action(async (namespace) => {
        try {
          const { restart } = await import('./commands/restart')
          await restart({ namespace })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Dashboard command
    program
      .command('dashboard')
      .description('Launch the TUI dashboard')
      .option('-w, --watch', 'Interactive mode with auto-refresh')
      .action(async (options) => {
        try {
          const { dashboard } = await import('./commands/dashboard')
          await dashboard(options)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    program
      .command('ai-monitor')
      .description('Intelligent log watcher and auto-healer')
      .option('--watch', 'Watch log file in real-time')
      .option('--log-file <path>', 'Log file to monitor')
      .option('--log-dir <path>', 'Override log directory (default: .loopwork/runs)')
      .option('--namespace <name>', 'Namespace to monitor (default: default)')
      .option('--model <id>', 'LLM model for analysis')
      .option('--dry-run', 'Watch and detect errors but do not execute healing actions')
      .option('--status', 'Show circuit breaker status and exit')
      .action(async (options) => {
        try {
          const { aiMonitor } = await import('./ai-monitor/cli')
          await aiMonitor(options)
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Init command
    program
      .command('init')
      .description('Initialize a new loopwork project')
      .action(async () => {
        try {
          const { init } = await import('./commands/init')
          await init()
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Start command with daemon support
    program
      .command('start')
      .description('Start loopwork (with optional daemon mode)')
      .option('-d, --daemon', 'Run as background daemon')
      .option('--tail, --follow', 'Tail logs after starting daemon')
      .option('--lines <number>', 'Number of initial log lines to show', '20')
      .option('--namespace <name>', 'Namespace for the loop', 'default')
      .option('--backend <type>', 'Task backend: github or json')
      .option('--repo <owner/repo>', 'GitHub repository')
      .option('--tasks-file <path>', 'Path to tasks.json file')
      .option('--feature <name>', 'Filter by feature label')
      .option('--max-iterations <number>', 'Maximum iterations')
      .option('--timeout <seconds>', 'Timeout per task in seconds')
      .option('--cli <name>', 'CLI to use (opencode, claude, gemini)')
      .option('--model <id>', 'Specific model ID')
      .option('--dry-run', 'Show what would be done without executing')
      .option('-y, --yes', 'Non-interactive mode')
      .option('--debug', 'Enable debug logging')
      .option('--config <path>', 'Path to config file')
      .option('--with-ai-monitor', 'Enable AI Monitor for auto-healing')
      .action(async (options) => {
        try {
          const { start } = await import('./commands/start')
          await start({
            ...options,
            lines: parseInt(options.lines, 10) || 20,
            maxIterations: options.maxIterations ? parseInt(options.maxIterations, 10) : undefined,
            timeout: options.timeout ? parseInt(options.timeout, 10) : undefined,
          })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Stop command
    program
      .command('stop [namespace]')
      .description('Stop a running loopwork daemon')
      .option('--all', 'Stop all running daemons')
      .action(async (namespace, options) => {
        try {
          const { LoopworkMonitor } = await import('./monitor')
          const monitor = new LoopworkMonitor()

          if (options.all) {
            const result = monitor.stopAll()
            if (result.stopped.length > 0) {
              logger.success(`Stopped: ${result.stopped.join(', ')}`)
            }
            if (result.errors.length > 0) {
              result.errors.forEach(err => logger.error(err))
            }
            if (result.stopped.length === 0 && result.errors.length === 0) {
              logger.info('No running daemons to stop')
            }
          } else {
            const ns = namespace || 'default'
            const result = monitor.stop(ns)
            if (result.success) {
              logger.success(`Stopped namespace '${ns}'`)
            } else {
              throw new LoopworkError(
                result.error || 'Failed to stop',
                [
                  `Check if namespace '${ns}' is actually running: loopwork status`,
                  'Ensure you have permissions to kill the process',
                  `Manual stop: kill <PID>`
                ]
              )
            }
          }
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Status command
    program
      .command('status')
      .description('Show status of all loopwork processes')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          const { LoopworkMonitor } = await import('./monitor')
          const { status } = await import('./commands/status')
          const chalk = (await import('chalk')).default
          const fs = await import('fs')
          const path = await import('path')
          const { formatUptime, formatDuration, isProcessAlive } = await import('./commands/shared/process-utils')

          await status({
            MonitorClass: LoopworkMonitor,
            process,
            fs: {
              existsSync: fs.default.existsSync,
              readFileSync: fs.default.readFileSync,
            },
            path: {
              join: path.default.join,
              basename: path.default.basename,
            },
            isProcessAlive,
            formatUptime,
            formatDuration,
            cwd: () => process.cwd(),
            chalk,
            json: options.json,
          })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Logs command
    program
      .command('logs [namespace]')
      .description('View logs for a loopwork session')
      .option('-f, --follow', 'Follow log output (like tail -f)')
      .option('-n, --lines <number>', 'Number of lines to show', '50')
      .option('--session <id>', 'View specific session by timestamp')
      .option('--task <id>', 'Filter logs by task iteration')
      .option('--json', 'Output as newline-delimited JSON')
      .action(async (namespace, options) => {
        try {
          const { logs } = await import('./commands/logs')
          await logs({
            namespace,
            follow: options.follow,
            lines: parseInt(options.lines, 10) || 50,
            session: options.session,
            task: options.task,
            json: options.json,
          })
        } catch (err) {
          handleError(err)
          process.exit(1)
        }
      })

    // Parse and execute
    await program.parseAsync(process.argv)
  }

  main().catch((err) => {
    handleError(err)
    process.exit(1)
  })
}
