import { Command } from 'commander'
import path from 'path'
import fs from 'fs'
import type { LoopworkConfig } from '../contracts'
import { DEFAULT_CONFIG } from '../contracts'
import type { BackendConfig } from './backends/types'
import type { LoopworkConfig as LoopworkFileConfig } from '../contracts'
import { logger } from './utils'

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
        return module.default || module
      } catch (e) {
        logger.warn(`Failed to load config from ${configPath}`)
      }
    }
  }

  return null
}

export async function getConfig(cliOptions?: Partial<Config> & { config?: string, yes?: boolean, task?: string }): Promise<Config> {
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
    tasksFile: rawOptions.tasksFile || (rawOptions.backend as any)?.tasksFile,
    repo: rawOptions.repo || (rawOptions.backend as any)?.repo,
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

  return {
    ...DEFAULT_CONFIG,
    repo: options.repo || fileConfig?.backend?.repo,
    feature: options.feature || fileConfig?.feature,
    startTask: options.task,
    maxIterations: parseInt(options.maxIterations, 10) || fileConfig?.maxIterations || 50,
    timeout: parseInt(options.timeout, 10) || fileConfig?.timeout || 600,
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
    projectRoot,
    outputDir: path.join(projectRoot, 'loopwork-runs', namespace, timestamp),
    sessionId: `loopwork-${namespace}-${timestamp}-${process.pid}`,
    backend,
    namespace,
  }
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
