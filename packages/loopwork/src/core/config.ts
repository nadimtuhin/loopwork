import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import type { LoopworkConfig } from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import type { BackendConfig } from '../contracts/backend'
import type { LoopworkConfig as LoopworkFileConfig } from '../contracts'
import { logger } from './utils'
import { LoopworkError } from './errors'

export interface Config extends LoopworkConfig {
  projectRoot: string
  outputDir: string
  sessionId: string
  debug: boolean
  resume: boolean
  startTask?: string
  backend: BackendConfig
  namespace: string // For running multiple loops concurrently
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

/**
 * Validate environment variables
 */
function validateEnvironmentVariables(): void {
  const backend = process.env.LOOPWORK_BACKEND
  if (backend && backend !== 'json' && backend !== 'github') {
    throw new LoopworkError(
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
  if (!supportedClis.includes(config.cli)) {
    throw new LoopworkError(
      `Invalid CLI: "${config.cli}"`,
      [
        `Supported CLIs: ${supportedClis.join(', ')}`,
        'Example: cli: "claude"',
        'Make sure the CLI is installed and available in PATH'
      ]
    )
  }

  if (isNaN(config.maxIterations) || config.maxIterations <= 0) {
    throw new LoopworkError(
      `Invalid maxIterations: ${config.maxIterations}`,
      [
        'maxIterations must be a positive number',
        'Example: maxIterations: 50',
        'Recommended range: 10-100'
      ]
    )
  }

  if (isNaN(config.timeout) || config.timeout <= 0) {
    throw new LoopworkError(
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
        `Invalid model ID: "${config.model}"`,
        suggestions
      )
    }
  }

  // Validate backend-specific config
  if (config.backend.type === 'json') {
    const tasksFile = config.backend.tasksFile
    const tasksDir = path.dirname(tasksFile)

    // Check if tasks file exists or parent directory is writable
    if (!fs.existsSync(tasksFile)) {
      // Check if parent directory exists and is writable
      if (!fs.existsSync(tasksDir)) {
        throw new LoopworkError(
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
  } else if (config.backend.type === 'github') {
    const repo = config.backend.repo
    if (repo) {
      const repoPattern = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
      if (!repoPattern.test(repo)) {
        throw new LoopworkError(
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

export async function getConfig(cliOptions?: Partial<Config> & { config?: string, yes?: boolean, task?: string }): Promise<Config> {
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
      .parse(process.argv)

    return program.opts()
  })()

  const options = {
    ...rawOptions,
    yes: rawOptions.yes ?? rawOptions.autoConfirm,
    task: rawOptions.task ?? rawOptions.startTask,
    backend: typeof rawOptions.backend === 'string' ? rawOptions.backend : rawOptions.backend?.type,
    tasksFile: rawOptions.tasksFile || (hasStringProperty(rawOptions.backend, 'tasksFile') ? rawOptions.backend.tasksFile : undefined),
    repo: rawOptions.repo || (hasStringProperty(rawOptions.backend, 'repo') ? rawOptions.backend.repo : undefined),
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
        'Config file found in parent directory',
        [
          `Found: ${parentConfig}`,
          'Run loopwork from the directory containing the config file',
          `Or specify config path: --config ${parentConfig}`
        ]
      )
    }

    throw new LoopworkError(
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
    detectBackendType(projectRoot, options.tasksFile || fileConfig?.backend?.tasksFile)

  const backend: BackendConfig = backendType === 'json'
    ? {
        type: 'json',
        tasksFile: options.tasksFile ||
          fileConfig?.backend?.tasksFile ||
          path.join(projectRoot, '.specs/tasks/tasks.json'),
        tasksDir: path.dirname(
          options.tasksFile ||
          fileConfig?.backend?.tasksFile ||
          path.join(projectRoot, '.specs/tasks/tasks.json')
        ),
      }
    : {
        type: 'github',
        repo: options.repo || fileConfig?.backend?.repo,
      }

  const config: Config = {
    ...DEFAULT_CONFIG,
    repo: options.repo || fileConfig?.backend?.repo,
    feature: options.feature || fileConfig?.feature,
    defaultPriority: options.defaultPriority ?? fileConfig?.defaultPriority,
    startTask: options.task,
    maxIterations: options.maxIterations !== undefined ? parseInt(options.maxIterations, 10) : (fileConfig?.maxIterations ?? 50),
    timeout: options.timeout !== undefined ? parseInt(options.timeout, 10) : (fileConfig?.timeout ?? 600),
    cli: options.cli || fileConfig?.cli || 'opencode',
    model: options.model || fileConfig?.model,
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
    logLevel: fileConfig?.logLevel || DEFAULT_CONFIG.logLevel || 'info',
    projectRoot,
    outputDir: path.join(projectRoot, 'loopwork-runs', namespace, timestamp),
    sessionId: `loopwork-${namespace}-${timestamp}-${process.pid}`,
    backend,
    namespace,
  }

  // Validate the final config
  validateConfig(config)

  // Set log level on logger
  if (config.debug) {
    logger.setLogLevel('debug')
  } else if (config.logLevel) {
    logger.setLogLevel(config.logLevel)
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
