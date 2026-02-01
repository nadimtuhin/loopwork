import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import type { LoopworkConfig, ParallelFailureMode, LogLevel, FeatureFlags } from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import { warnIfLooseBackendConfig, type BackendConfig, type JsonBackendConfig, type GithubBackendConfig } from '../contracts/backend'
import type { LoopworkConfig as LoopworkFileConfig } from '../contracts'
import { logger } from './utils'
import { LoopworkError } from './errors'
import { createRegistry, type IAgentRegistry } from '@loopwork-ai/agents'
import chokidar from 'chokidar'
import { EventEmitter } from 'events'

/**
 * Parse --parallel option value
 * --parallel → 2 (default)
 * --parallel 3 → 3
 */
function parseParallelOption(value: string | undefined): number {
  if (value === undefined || value === '') {
    return 2 // Default to 2 workers when --parallel is used without a number
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed) || parsed < 1) {
    return 2
  }
  return Math.min(parsed, 5) // Cap at 5 workers
}

/**
 * Parse verbosity level from command-line arguments
 * Returns log level based on:
 * - --quiet / -q: 'silent'
 * - -v / --verbose: 'debug'
 * - -vv: 'debug'
 * - -vvv: 'trace'
 */
function parseVerbosityLevel(args: string[]): 'silent' | 'debug' | 'trace' | undefined {
  // Check for quiet flag first (takes priority)
  if (args.includes('--quiet') || args.includes('-q')) {
    return 'silent'
  }

  // Look for verbose patterns: -v, -vv, -vvv
  for (const arg of args) {
    if (arg === '-vvv' || arg === '--verbose=vvv') {
      return 'trace'
    }
    if (arg === '-vv') {
      return 'debug'
    }
    if (arg === '-v' || arg === '--verbose') {
      return 'debug'
    }
  }

  return undefined
}

export interface Config extends LoopworkConfig {
  projectRoot: string
  outputDir: string
  sessionId: string
  debug: boolean
  resume: boolean
  startTask?: string
  backend: BackendConfig
  namespace: string // For running multiple loops concurrently
  parallel: number // Number of parallel workers (1 = sequential)
  parallelFailureMode: ParallelFailureMode
  logLevel: LogLevel
  flags?: FeatureFlags
  quarantineThreshold?: number
  retryCooldown?: number
}

/**
 * Type guard to check if a value has a string property
 */
function hasStringProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, string | undefined> {
  return typeof obj === 'object' && obj !== null && key in obj
}

export function isBackendConfig(config: unknown): config is BackendConfig {
  return typeof config === 'object' && 
         config !== null && 
         'type' in config && 
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         ['json', 'github', 'fallback'].includes((config as any).type)
}

export function isJsonBackendConfig(config: unknown): config is JsonBackendConfig {
  return isBackendConfig(config) && 
         config.type === 'json' && 
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         typeof (config as any).tasksFile === 'string'
}

export function isGithubBackendConfig(config: unknown): config is GithubBackendConfig {
  return isBackendConfig(config) && 
         config.type === 'github'
}

export function validateBackendConfig(config: unknown): void {
  if (!isBackendConfig(config)) {
    throw new LoopworkError(
      'ERR_CONFIG_INVALID',
      'Invalid backend configuration',
      [
        'Backend configuration must be an object with a "type" property',
        'Supported types: "json", "github"',
        'Example: backend: { type: "json", tasksFile: "..." }'
      ]
    )
  }

  if (config.type === 'json' && !isJsonBackendConfig(config)) {
    throw new LoopworkError(
      'ERR_CONFIG_INVALID',
      'Invalid JSON backend configuration',
      [
        'JSON backend requires a "tasksFile" property (string)',
        'Example: backend: { type: "json", tasksFile: ".specs/tasks/tasks.json" }'
      ]
    )
  }

  // Issue warning for loose configurations
  warnIfLooseBackendConfig(config as BackendConfig)
}

/**
 * Validate environment variables
 */
function validateEnvironmentVariables(): void {
  const backend = process.env.LOOPWORK_BACKEND
  if (backend && backend !== 'json' && backend !== 'github') {
    throw new LoopworkError(
      'ERR_ENV_INVALID',
      `Invalid LOOPWORK_BACKEND environment variable: "${backend}"`,
      [
        'Valid values: "json" or "github"',
        'Example: export LOOPWORK_BACKEND=json',
        'Or remove the variable to auto-detect'
      ]
    )
  }

  const nonInteractive = process.env.LOOPWORK_NON_INTERACTIVE
  if (nonInteractive && nonInteractive !== 'true' && nonInteractive !== 'false') {
    throw new LoopworkError(
      'ERR_ENV_INVALID',
      `Invalid LOOPWORK_NON_INTERACTIVE environment variable: "${nonInteractive}"`,
      [
        'Valid values: "true" or "false"',
        'Example: export LOOPWORK_NON_INTERACTIVE=true'
      ]
    )
  }

  const debug = process.env.LOOPWORK_DEBUG
  if (debug && debug !== 'true' && debug !== 'false') {
    throw new LoopworkError(
      'ERR_ENV_INVALID',
      `Invalid LOOPWORK_DEBUG environment variable: "${debug}"`,
      [
        'Valid values: "true" or "false"',
        'Example: export LOOPWORK_DEBUG=true'
      ]
    )
  }
}

/**
 * Validate configuration values
 */
function validateConfig(config: Config): void {
  const supportedClis = ['opencode', 'claude', 'gemini']
  if (!config.cli || !supportedClis.includes(config.cli)) {
    throw new LoopworkError(
      'ERR_CONFIG_INVALID',
      `Invalid CLI: "${config.cli}"`,
      [
        `Supported CLIs: ${supportedClis.join(', ')}`,
        'Example: cli: "claude"',
        'Make sure the CLI is installed and available in PATH'
      ]
    )
  }

  if (config.maxIterations === undefined || isNaN(config.maxIterations) || config.maxIterations <= 0) {
    throw new LoopworkError(
      'ERR_CONFIG_INVALID',
      `Invalid maxIterations: ${config.maxIterations}`,
      [
        'maxIterations must be a positive number',
        'Example: maxIterations: 50',
        'Recommended range: 10-100'
      ]
    )
  }

  if (config.timeout === undefined || isNaN(config.timeout) || config.timeout <= 0) {
    throw new LoopworkError(
      'ERR_CONFIG_INVALID',
      `Invalid timeout: ${config.timeout}`,
      [
        'timeout must be a positive number (in seconds)',
        'Example: timeout: 600',
        'Recommended range: 60-3600 (1 minute to 1 hour)'
      ]
    )
  }

  if (config.defaultPriority !== undefined) {
    if (isNaN(config.defaultPriority) || !Number.isInteger(config.defaultPriority) ||
        config.defaultPriority < 1 || config.defaultPriority > 5) {
      throw new LoopworkError(
        'ERR_CONFIG_INVALID',
        `Invalid defaultPriority: ${config.defaultPriority}`,
        [
          'defaultPriority must be an integer between 1 and 5',
          'Example: defaultPriority: 3',
          '1 = highest priority, 5 = lowest priority'
        ]
      )
    }
  }

  // Validate model ID if provided
  if (config.model) {
    const validModelPatterns = [
      /^claude-[a-z0-9.-]+$/,       // claude-sonnet-4-5, claude-opus-3-5, etc.
      /^gpt-[a-z0-9.-]+$/,          // gpt-4, gpt-3.5-turbo, etc.
      /^gemini-[a-z0-9.-]+$/,       // gemini-pro, gemini-1.5-flash, etc.
    ]

    const isValid = validModelPatterns.some(pattern => pattern.test(config.model!))

    if (!isValid) {
      const suggestions = [
        'Model ID must match one of these formats:',
        '  - claude-* (e.g., claude-sonnet-4-5, claude-opus-3-5)',
        '  - gpt-* (e.g., gpt-4, gpt-3.5-turbo)',
        '  - gemini-* (e.g., gemini-pro, gemini-1.5-flash)',
        '',
        'Example: model: "claude-sonnet-4-5"',
      ]

      // Add specific suggestions based on common mistakes
      if (config.model.includes('sonnet') && !config.model.startsWith('claude-')) {
        suggestions.push('Did you mean: "claude-sonnet-4-5"?')
      } else if (config.model.includes('opus') && !config.model.startsWith('claude-')) {
        suggestions.push('Did you mean: "claude-opus-3-5"?')
      } else if (config.model.includes('haiku') && !config.model.startsWith('claude-')) {
        suggestions.push('Did you mean: "claude-haiku-3-5"?')
      } else if (config.model.match(/^(gpt)?-?4/i)) {
        suggestions.push('Did you mean: "gpt-4" or "gpt-4-turbo"?')
      } else if (config.model.match(/^(gpt)?-?3/i)) {
        suggestions.push('Did you mean: "gpt-3.5-turbo"?')
      } else if (config.model.includes('gemini') && !config.model.startsWith('gemini-')) {
        suggestions.push('Did you mean: "gemini-pro" or "gemini-1.5-flash"?')
      }

      throw new LoopworkError(
        'ERR_CONFIG_INVALID',
        `Invalid model ID: "${config.model}"`,
        suggestions
      )
    }
  }

  // Validate backend-specific config
  validateBackendConfig(config.backend)

  if (isJsonBackendConfig(config.backend)) {
    const backend = config.backend
    const tasksFile = backend.tasksFile as string
    const tasksDir = path.dirname(tasksFile)

    // Check if tasks file exists or parent directory is writable
    if (!fs.existsSync(tasksFile)) {
      // Check if parent directory exists and is writable
      if (!fs.existsSync(tasksDir)) {
        throw new LoopworkError(
          'ERR_FILE_NOT_FOUND',
          `Tasks directory does not exist: ${tasksDir}`,
          [
            'Create the directory:',
            `  mkdir -p ${tasksDir}`,
            'Or specify a different path in your config:',
            '  backend: { type: "json", tasksFile: "path/to/tasks.json" }'
          ]
        )
      }

      try {
        fs.accessSync(tasksDir, fs.constants.W_OK)
      } catch {
        throw new LoopworkError(
          'ERR_FILE_WRITE',
          `Tasks directory is not writable: ${tasksDir}`,
          [
            'Check directory permissions:',
            `  ls -la ${path.dirname(tasksDir)}`,
            'Fix permissions:',
            `  chmod 755 ${tasksDir}`
          ]
        )
      }
    }
  } else if (isGithubBackendConfig(config.backend)) {
    const repo = config.backend.repo
    if (repo) {
      const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
      if (!repoPattern.test(repo)) {
        throw new LoopworkError(
          'ERR_CONFIG_INVALID',
          `Invalid GitHub repository format: "${repo}"`,
          [
            'Repository must be in format: owner/repo',
            'Example: repo: "nadimtuhin/loopwork"',
            'Or omit to auto-detect from current git repository'
          ]
        )
      }
    }
  }
}

/**
 * Load configuration from loopwork.config.ts or loopwork.config.js
 */
async function loadConfigFile(projectRoot: string): Promise<Partial<LoopworkFileConfig> | null> {
  // If projectRoot is actually a file path (from --config flag), use it directly
  if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isFile()) {
    const configPath = projectRoot
    try {
      const module = await import(configPath)
      const config = module.default || module
      return config
    } catch (e: unknown) {
      throw e
    }
  }

  const configPaths = [
    path.join(projectRoot, 'loopwork.config.ts'),
    path.join(projectRoot, 'loopwork.config.js'),
    path.join(projectRoot, 'loopwork.config.mjs'),
  ]

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const module = await import(configPath)
        const config = module.default || module

        // Validate that we got a config object
        if (!config || typeof config !== 'object') {
          throw new LoopworkError(
            'ERR_CONFIG_INVALID',
            'Config file does not export a configuration object',
            [
              'Make sure your config file has a default export',
              'Example: export default defineConfig({ ... })',
              'Or: module.exports = { ... }'
            ],
            'https://github.com/nadimtuhin/loopwork#configuration'
          )
        }

        return config
      } catch (e: unknown) {
        // Detect specific error types
        const errorMessage = e instanceof Error ? e.message : String(e)
        const errorStack = e instanceof Error ? e.stack : undefined

        const isSyntaxError = errorMessage.includes('SyntaxError') || errorMessage.includes('Unexpected')
        const isImportError = errorMessage.includes('Cannot find module') || errorMessage.includes('MODULE_NOT_FOUND')
        const isExportError = e instanceof LoopworkError

        if (isExportError) {
          throw e
        } else if (isSyntaxError) {
          const lineMatch = errorMessage.match(/at line (\d+)/) || errorStack?.match(/:(\d+):\d+/)
          const lineInfo = lineMatch ? ` at line ${lineMatch[1]}` : ''
          throw new LoopworkError(
            'ERR_CONFIG_LOAD',
            `Syntax error in config file${lineInfo}: ${errorMessage}`,
            [
              'Check your loopwork.config.ts for syntax errors',
              'Common issues: missing commas, unclosed brackets, invalid TypeScript syntax',
              'Example config: https://github.com/nadimtuhin/loopwork#configuration',
              'Run: npx tsc --noEmit loopwork.config.ts'
            ],
            'https://github.com/nadimtuhin/loopwork#configuration'
          )
        } else if (isImportError) {
          throw new LoopworkError(
            'ERR_CONFIG_LOAD',
            `Missing dependency in config file: ${errorMessage}`,
            [
              'Install missing dependencies: npm install (or bun install)',
              'Check that all imports in loopwork.config.ts are installed',
              'If using plugins, make sure they are in package.json'
            ],
            'https://github.com/nadimtuhin/loopwork#configuration'
          )
        } else {
          throw new LoopworkError(
            'ERR_CONFIG_LOAD',
            `Invalid config file: ${errorMessage}`,
            [
              'Check your loopwork.config.ts for errors',
              'Example config: https://github.com/nadimtuhin/loopwork#configuration'
            ],
            'https://github.com/nadimtuhin/loopwork#configuration'
          )
        }
      }
    }
  }

  return null
}

export function getTasksFile(config: unknown): string | null {
  if (typeof config === 'object' && config !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyConfig = config as any
    if (anyConfig.backend && isJsonBackendConfig(anyConfig.backend)) {
      return anyConfig.backend.tasksFile
    }
    if (isJsonBackendConfig(config)) {
      return config.tasksFile
    }
  }
  return null
}

export function getTasksDir(config: unknown): string | null {
  if (typeof config === 'object' && config !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyConfig = config as any
    if (anyConfig.backend && isJsonBackendConfig(anyConfig.backend)) {
      return anyConfig.backend.tasksDir ?? null
    }
    if (isJsonBackendConfig(config)) {
      return config.tasksDir ?? null
    }
  }
  return null
}

export function isFeatureEnabled(config: unknown, feature: string): boolean {
  if (typeof config !== 'object' || config === null) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyConfig = config as any
  
  const flags = anyConfig.flags || (anyConfig.config && anyConfig.config.flags)
  if (flags && typeof flags === 'object' && flags[feature] === true) {
    return true
  }

  const backendFlags = anyConfig.backend?.flags
  if (backendFlags && typeof backendFlags === 'object' && backendFlags[feature] === true) {
    return true
  }

  return false
}

export async function getConfig(cliOptions?: Partial<Config> & { config?: string, yes?: boolean, task?: string, hotReload?: boolean }): Promise<Config> {
  // Validate environment variables first
  validateEnvironmentVariables()

  // If cliOptions is an empty object, treat it as undefined so we parse CLI args
  const hasCliOptions = cliOptions && Object.keys(cliOptions).length > 0

  const rawOptions = (hasCliOptions ? cliOptions : null) || (() => {
    const program = new Command()

    program
      .option('--backend <type>', 'Task backend: github or json (auto-detects if not specified)')
      .option('--repo <owner/repo>', 'GitHub repository (defaults to current repo)')
      .option('--tasks-file <path>', 'Path to tasks.json file (for json backend)')
      .option('--feature <name>', 'Filter by feature label (feat:<name>)')
      .option('--task <id>', 'Start from specific task ID')
      .option('--max-iterations <number>', 'Maximum iterations before stopping')
      .option('--timeout <seconds>', 'Timeout per task in seconds')
      .option('--cli <name>', 'CLI to use (opencode, claude, gemini)')
      .option('--model <id>', 'Specific model ID')
      .option('--resume', 'Resume from last saved state')
      .option('--dry-run', 'Show what would be done without executing')
      .option('-y, --yes', 'Non-interactive mode, auto-continue on errors')
      .option('--debug', 'Enable debug logging')
      .option('--namespace <name>', 'Namespace for running multiple loops')
      .option('--config <path>', 'Path to config file (loopwork.config.ts)')
      .option('--parallel [count]', 'Enable parallel execution (default: 2 workers)', parseParallelOption)
      .option('--sequential', 'Force sequential execution (parallel=1)')
      .parse(process.argv)

    return program.opts()
  })() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    ...rawOptions,
    yes: rawOptions.yes ?? rawOptions.autoConfirm,
    task: rawOptions.task ?? rawOptions.startTask,
    backend: typeof rawOptions.backend === 'string' ? rawOptions.backend : rawOptions.backend?.type,
    tasksFile: (rawOptions.tasksFile as string | undefined) || (hasStringProperty(rawOptions.backend, 'tasksFile') ? rawOptions.backend.tasksFile : undefined),
    repo: (rawOptions.repo as string | undefined) || (hasStringProperty(rawOptions.backend, 'repo') ? rawOptions.backend.repo : undefined),
  }

  // Find project root
  let currentDir = process.cwd()
  let projectRoot = currentDir
  while (currentDir !== '/' && currentDir.length > 1) {
    if (
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, 'package.json'))
    ) {
      projectRoot = currentDir
      break
    }
    currentDir = path.dirname(currentDir)
  }

  // Load config file (lowest priority)
  const fileConfig = await loadConfigFile(options.config ? path.resolve(options.config) : projectRoot)

  if (!fileConfig && !options.backend && !options.tasksFile) {
    const checkedPaths = [
      path.join(projectRoot, 'loopwork.config.ts'),
      path.join(projectRoot, 'loopwork.config.js'),
      path.join(projectRoot, 'loopwork.config.mjs'),
    ]

    // Check for common mistakes
    const wrongExtensions = [
      path.join(projectRoot, 'loopwork.config.json'),
      path.join(projectRoot, '.loopwork/config'),
      path.join(projectRoot, '.loopwork/config.json'),
    ]

    const foundWrongExt = wrongExtensions.find(p => fs.existsSync(p))
    if (foundWrongExt) {
      throw new LoopworkError(
        'ERR_CONFIG_INVALID',
        `Found config file with wrong format: ${path.basename(foundWrongExt)}`,
        [
          'Loopwork requires a TypeScript or JavaScript config file',
          'Rename to: loopwork.config.ts or loopwork.config.js',
          "Or run: npx loopwork init"
        ]
      )
    }

    // Check parent directories
    const parentConfig = path.join(path.dirname(projectRoot), 'loopwork.config.ts')
    if (fs.existsSync(parentConfig)) {
      throw new LoopworkError(
        'ERR_CONFIG_MISSING',
        'Config file found in parent directory',
        [
          `Found: ${parentConfig}`,
          'Run loopwork from the directory containing the config file',
          `Or specify config path: --config ${parentConfig}`
        ]
      )
    }

    throw new LoopworkError(
      'ERR_CONFIG_MISSING',
      'loopwork.config.ts not found',
      [
        "Run 'npx loopwork init' to create a config file",
        'Checked paths:',
        ...checkedPaths.map(p => `  - ${p}`)
      ],
      'https://github.com/nadimtuhin/loopwork#configuration'
    )
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // Priority: CLI args > env vars > config file > defaults
  const namespace = options.namespace ||
    process.env.LOOPWORK_NAMESPACE ||
    fileConfig?.namespace ||
    'default'

  // Determine backend configuration
  const backendType = options.backend ||
    process.env.LOOPWORK_BACKEND ||
    fileConfig?.backend?.type ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    detectBackendType(projectRoot, options.tasksFile || (fileConfig?.backend as any)?.tasksFile)

  const backend: BackendConfig = backendType === 'json'
    ? {
        type: 'json',
        tasksFile: options.tasksFile ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fileConfig?.backend as any)?.tasksFile ||
          path.join(projectRoot, '.specs/tasks/tasks.json'),
        tasksDir: path.dirname(
          options.tasksFile ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (fileConfig?.backend as any)?.tasksFile ||
          path.join(projectRoot, '.specs/tasks/tasks.json')
        ),
      }
    : {
        type: 'github',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        repo: options.repo || (fileConfig?.backend as any)?.repo,
      }

  // Determine parallel setting: --sequential forces 1, --parallel [N] sets workers
  const parallelValue = options.sequential
    ? 1
    : (options.parallel !== undefined
      ? options.parallel
      : (fileConfig?.parallel ?? 1))

  // Determine log level: CLI flags > debug flag > file config > default
  let logLevel: LogLevel = (fileConfig?.logLevel || DEFAULT_CONFIG.logLevel || 'info') as LogLevel

  // Check CLI flags for verbosity overrides
  const cliVerbosity = parseVerbosityLevel(process.argv)
  if (cliVerbosity === 'silent') {
    logLevel = 'error'
  } else if (cliVerbosity === 'debug') {
    logLevel = 'debug'
  } else if (cliVerbosity === 'trace') {
    logLevel = 'trace'
  } else if (options.debug) {
    logLevel = 'debug'
  }

  const config: Config = {
    ...DEFAULT_CONFIG,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo: options.repo || (fileConfig?.backend as any)?.repo,
    feature: options.feature || fileConfig?.feature,
    defaultPriority: options.defaultPriority ?? fileConfig?.defaultPriority,
    startTask: options.task,
    maxIterations: options.maxIterations !== undefined ? parseInt(options.maxIterations, 10) : (fileConfig?.maxIterations ?? 50),
    timeout: options.timeout !== undefined ? parseInt(options.timeout, 10) : (fileConfig?.timeout ?? 600),
    cli: options.cli || fileConfig?.cli || 'opencode',
    model: options.model || fileConfig?.model,
    cliConfig: fileConfig?.cliConfig,
    autoConfirm: options.yes ||
      process.env.LOOPWORK_NON_INTERACTIVE === 'true' ||
      fileConfig?.autoConfirm ||
      false,
    dryRun: options.dryRun || fileConfig?.dryRun || false,
    resume: options.resume || false,
    debug: options.debug ||
      process.env.LOOPWORK_DEBUG === 'true' ||
      fileConfig?.debug ||
      false,
    logLevel,
    projectRoot,
    outputDir: path.join(projectRoot, '.loopwork', 'runs', namespace, timestamp),
    sessionId: `loopwork-${namespace}-${timestamp}-${process.pid}`,
    backend,
    namespace,
    parallel: parallelValue,
    parallelFailureMode: fileConfig?.parallelFailureMode ?? 'continue',
    dynamicTasks: fileConfig?.dynamicTasks,
  }

  // Validate the final config
  validateConfig(config)

  // Set log level on logger
  logger.setLogLevel(config.logLevel)

  // Start hot reload if enabled
  if (cliOptions?.hotReload || process.env.LOOPWORK_HOT_RELOAD === 'true') {
    const hotReloadManager = getConfigHotReloadManager()
    const configPath = options.config ? path.resolve(options.config) : (fileConfig && path.join(projectRoot, 'loopwork.config.ts')) || path.join(projectRoot, 'loopwork.config.ts')

    if (fs.existsSync(configPath)) {
      hotReloadManager.start(configPath, config)
      logger.info(`Config hot reload enabled: ${configPath}`)
    } else {
      logger.warn(`Config file not found for hot reload: ${configPath}`)
    }
  }

  return config
}

/**
 * Auto-detect backend type based on files present
 */
function detectBackendType(projectRoot: string, tasksFile?: string): 'github' | 'json' {
  const jsonPath = tasksFile || path.join(projectRoot, '.specs/tasks/tasks.json')
  if (fs.existsSync(jsonPath)) {
    return 'json'
  }
  return 'github'
}

// Global singleton for subagent registry
let subagentRegistry: IAgentRegistry | null = null

/**
 * Get or create the subagent registry from config
 *
 * Returns a singleton registry that is populated with agents from the config.
 * The registry is created on first call and reused on subsequent calls.
 *
 * @param config - The Loopwork configuration containing subagent definitions
 * @returns The subagent registry
 */
export function getSubagentRegistry(config: LoopworkConfig): IAgentRegistry {
  if (!subagentRegistry) {
    subagentRegistry = createRegistry()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configAny = config as any
    if (configAny.subagents) {
      for (const agent of configAny.subagents) {
        subagentRegistry.register(agent)
      }
    }
    if (configAny.defaultSubagent) {
      subagentRegistry.setDefault(configAny.defaultSubagent)
    }
  }
  return subagentRegistry
}

/**
 * Reset subagent registry (for testing)
 * @internal
 */
export function resetSubagentRegistry(): void {
  subagentRegistry = null
}

/**
 * Config reload event type
 */
export interface ConfigReloadEvent {
  timestamp: Date
  configPath: string
  config: Config
}

/**
 * Config hot reload manager
 * Watches config file for changes and reloads configuration
 */
class ConfigHotReloadManager {
  private watcher: chokidar.FSWatcher | null = null
  private emitter: EventEmitter = new EventEmitter()
  private currentConfig: Config | null = null
  private currentConfigPath: string | null = null

  /**
    * Start watching for config changes
    */
  start(configPath: string, initialConfig: Config): void {
    if (this.watcher) {
      logger.debug('Config watcher already running')
      return
    }

    this.currentConfig = initialConfig
    this.currentConfigPath = configPath
    currentConfigPath = configPath  // Store for reloadConfig function

    logger.debug(`Starting config watcher: ${configPath}`)

    this.watcher = chokidar.watch(configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10,
      },
    })

    this.watcher.on('change', async (filePath) => {
      logger.info(`Config file changed: ${filePath}`)
      try {
        const newConfig = await this.reloadConfig(filePath)
        if (newConfig) {
          this.currentConfig = newConfig
          const event: ConfigReloadEvent = {
            timestamp: new Date(),
            configPath: filePath,
            config: newConfig,
          }
          this.emitter.emit('config-reloaded', event)
          logger.info('Configuration reloaded successfully')
        }
      } catch (error) {
        logger.error(`Failed to reload config: ${error}`)
      }
    })

    this.watcher.on('error', (error) => {
      logger.error(`Config watcher error: ${error}`)
    })
  }

  /**
    * Reload configuration from file
    */
  async reloadConfig(configPath: string): Promise<Config | null> {
    try {
      // Clear module cache to force re-import
      const resolvedPath = path.resolve(configPath)
      delete require.cache[require.resolve(resolvedPath)]

      const module = await import(resolvedPath)
      const fileConfig = module.default || module

      if (!fileConfig || typeof fileConfig !== 'object') {
        logger.warn('Reloaded config is invalid, keeping current config')
        return this.currentConfig
      }

      // Merge with CLI options and environment variables
      // We need to preserve CLI args that were set when initially loading
      const config: Config = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        projectRoot: this.currentConfig?.projectRoot || process.cwd(),
        outputDir: this.currentConfig?.outputDir || path.join(process.cwd(), '.loopwork', 'runs', 'default', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)),
        sessionId: this.currentConfig?.sessionId || `loopwork-default-${Date.now()}-${process.pid}`,
        debug: fileConfig.debug || false,
        resume: false,
        backend: fileConfig.backend || this.currentConfig?.backend || { type: 'json', tasksFile: '.specs/tasks/tasks.json' },
        namespace: fileConfig.namespace || 'default',
        parallel: fileConfig.parallel || 1,
        parallelFailureMode: fileConfig.parallelFailureMode || 'continue',
        logLevel: fileConfig.logLevel || 'info',
      }

      validateConfig(config)
      return config
    } catch (error) {
      logger.error(`Error reloading config: ${error}`)
      return null
    }
  }

  /**
   * Stop watching for config changes
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      logger.debug('Config watcher stopped')
    }
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): Config | null {
    return this.currentConfig
  }

  /**
   * Register listener for config reload events
   */
  onReload(callback: (event: ConfigReloadEvent) => void): void {
    this.emitter.on('config-reloaded', callback)
  }

  /**
   * Remove listener for config reload events
   */
  offReload(callback: (event: ConfigReloadEvent) => void): void {
    this.emitter.off('config-reloaded', callback)
  }

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return this.watcher !== null
  }
}

// Global singleton for config hot reload manager
let hotReloadManager: ConfigHotReloadManager | null = null

/**
 * Get or create the config hot reload manager
 */
export function getConfigHotReloadManager(): ConfigHotReloadManager {
  if (!hotReloadManager) {
    hotReloadManager = new ConfigHotReloadManager()
  }
  return hotReloadManager
}

/**
 * Reset config hot reload manager (for testing)
 * @internal
 */
export function resetConfigHotReloadManager(): void {
  if (hotReloadManager) {
    hotReloadManager.stop()
  }
  hotReloadManager = null
}

/**
 * Manually trigger a config reload
 *
 * This function allows users to programmatically reload the configuration
 * without waiting for file system changes. It is useful for:
 * - CLI commands that need to apply new config immediately
 * - Integration with external config management systems
 * - Testing purposes
 *
 * @returns The reloaded configuration, or null if reload failed or watcher not active
 *
 * @example
 * ```typescript
 * import { reloadConfig } from 'loopwork'
 *
 * // After making changes to loopwork.config.ts
 * const newConfig = await reloadConfig()
 * if (newConfig) {
 *   console.log('Config reloaded successfully')
 * }
 * ```
 */
export async function reloadConfig(): Promise<Config | null> {
  const manager = getConfigHotReloadManager()

  if (!manager.isWatching()) {
    logger.warn('Config hot reload is not active. Call getConfig({ hotReload: true }) first.')
    return null
  }

  const currentConfig = manager.getCurrentConfig()
  if (!currentConfig || !currentConfigPath) {
    logger.warn('No active config to reload')
    return null
  }

  const newConfig = await manager.reloadConfig(currentConfigPath)
  return newConfig
}

/**
 * Current config path being watched (for reloadConfig)
 */
let currentConfigPath: string | null = null
