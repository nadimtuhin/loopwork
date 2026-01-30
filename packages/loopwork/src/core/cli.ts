import { spawn, spawnSync, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger, StreamLogger } from './utils'
import type { Config } from './config'
import { LoopworkError } from './errors'
import { PROGRESS_UPDATE_INTERVAL_MS, SIGKILL_DELAY_MS } from './constants'
import type {
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliType,
} from '../contracts/cli'
import { DEFAULT_RETRY_CONFIG, DEFAULT_CLI_EXECUTOR_CONFIG } from '../contracts/cli'
import { ModelSelector, calculateBackoffDelay } from './model-selector'

/**
 * Legacy CliConfig interface for backward compatibility
 * @deprecated Use ModelConfig from contracts/cli instead
 */
export interface CliConfig {
  name: string
  displayName?: string
  cli: 'opencode' | 'claude'
  model: string
}

/**
 * Default primary model pool
 * Used when no custom models are configured
 */
export const EXEC_MODELS: ModelConfig[] = [
  { name: 'sonnet-claude', displayName: 'claude', cli: 'claude', model: 'sonnet' },
  { name: 'sonnet-opencode', displayName: 'sonnet', cli: 'opencode', model: 'google/antigravity-claude-sonnet-4-5' },
  { name: 'gemini-3-flash', displayName: 'gemini-flash', cli: 'opencode', model: 'google/antigravity-gemini-3-flash' },
]

/**
 * Default fallback model pool
 * Used when primary models are exhausted (quota, persistent failures)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  { name: 'opus-claude', displayName: 'opus', cli: 'claude', model: 'opus' },
  { name: 'gemini-3-pro', displayName: 'gemini-pro', cli: 'opencode', model: 'google/antigravity-gemini-3-pro' },
]

/**
 * Environment variable names for CLI path overrides
 */
const CLI_PATH_ENV_VARS: Record<CliType, string> = {
  claude: 'LOOPWORK_CLAUDE_PATH',
  opencode: 'LOOPWORK_OPENCODE_PATH',
  gemini: 'LOOPWORK_GEMINI_PATH',
}

export class CliExecutor {
  private cliPaths: Map<string, string> = new Map()
  private currentSubprocess: ChildProcess | null = null
  private modelSelector: ModelSelector
  private cliConfig: CliExecutorConfig
  private retryConfig: Required<RetryConfig>

  // Timing configuration
  private sigkillDelayMs: number
  private progressIntervalMs: number

  constructor(private config: Config) {
    // Merge default config with user config
    this.cliConfig = {
      ...DEFAULT_CLI_EXECUTOR_CONFIG,
      ...config.cliConfig,
    }

    // Merge retry config
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...this.cliConfig.retry,
    }

    // Set timing values
    this.sigkillDelayMs = this.cliConfig.sigkillDelayMs ?? SIGKILL_DELAY_MS
    this.progressIntervalMs = this.cliConfig.progressIntervalMs ?? PROGRESS_UPDATE_INTERVAL_MS

    // Detect CLI paths
    this.detectClis()

    // Initialize model selector with configured or default models
    const primaryModels = this.cliConfig.models ?? EXEC_MODELS
    const fallbackModels = this.cliConfig.fallbackModels ?? FALLBACK_MODELS
    const strategy = this.cliConfig.selectionStrategy ?? 'round-robin'

    this.modelSelector = new ModelSelector(primaryModels, fallbackModels, strategy)
  }

  private detectClis(): void {
    const home = process.env.HOME || ''

    // Default candidate paths for each CLI
    const defaultCandidates: Record<string, string[]> = {
      opencode: [`${home}/.opencode/bin/opencode`, '/usr/local/bin/opencode'],
      claude: [
        `${home}/.nvm/versions/node/v20.18.3/bin/claude`,
        `${home}/.nvm/versions/node/v22.13.0/bin/claude`,
        '/usr/local/bin/claude',
        `${home}/.npm/bin/claude`,
      ],
      gemini: [
        `${home}/.local/bin/gemini`,
        '/usr/local/bin/gemini',
      ],
    }

    const checkedPaths: Record<string, string[]> = {}

    for (const [cli, defaultPaths] of Object.entries(defaultCandidates)) {
      checkedPaths[cli] = []
      const cliType = cli as CliType

      // Priority 1: Environment variable override
      const envVar = CLI_PATH_ENV_VARS[cliType]
      const envPath = process.env[envVar]
      if (envPath && fs.existsSync(envPath)) {
        this.cliPaths.set(cli, envPath)
        logger.debug(`Using ${cli} from ${envVar}: ${envPath}`)
        continue
      }

      // Priority 2: Config file cliPaths override
      const configPath = this.cliConfig.cliPaths?.[cliType]
      if (configPath && fs.existsSync(configPath)) {
        this.cliPaths.set(cli, configPath)
        logger.debug(`Using ${cli} from config: ${configPath}`)
        continue
      }

      // Priority 3: Try PATH via which
      const whichResult = spawnSync('which', [cli], { encoding: 'utf-8' })
      if (whichResult.status === 0 && whichResult.stdout?.trim()) {
        this.cliPaths.set(cli, whichResult.stdout.trim())
        continue
      }

      // Priority 4: Try known default paths
      for (const p of defaultPaths) {
        checkedPaths[cli].push(p)
        if (fs.existsSync(p)) {
          this.cliPaths.set(cli, p)
          break
        }
      }
    }

    if (this.cliPaths.size === 0) {
      const checkedPathsList = Object.entries(checkedPaths)
        .map(([cli, paths]) => `  ${cli}: ${paths.join(', ')}`)
        .join('\n')

      throw new LoopworkError(
        'No AI CLI tools found in PATH or known locations',
        [
          'Checked the following locations:',
          checkedPathsList,
          '',
          'Install one of these CLI tools:',
          '  Claude Code: https://claude.com/code',
          '  OpenCode: https://opencode.ai',
          '',
          'Or set a custom path via environment variable:',
          '  LOOPWORK_CLAUDE_PATH=/path/to/claude',
          '  LOOPWORK_OPENCODE_PATH=/path/to/opencode',
          '',
          "Or run 'loopwork init' to see installation instructions"
        ],
        'https://github.com/nadimtuhin/loopwork#installation'
      )
    }

    // Validate requested CLI is available (legacy config support)
    const requestedCli = this.config.cli
    if (requestedCli && !this.cliPaths.has(requestedCli)) {
      throw new LoopworkError(
        `AI CLI '${requestedCli}' not found in PATH`,
        [
          `Install ${requestedCli === 'claude' ? 'Claude Code' : 'OpenCode'}: ${requestedCli === 'claude' ? 'https://claude.com/code' : 'https://opencode.ai'}`,
          `Or change CLI in config to one of: ${Array.from(this.cliPaths.keys()).join(', ') || 'none found'}`,
          `Or set custom path: ${CLI_PATH_ENV_VARS[requestedCli as CliType]}=/path/to/${requestedCli}`,
          'Or ensure the CLI is in your PATH and try again'
        ],
        'https://github.com/nadimtuhin/loopwork#configuration'
      )
    }

    logger.info(`Available CLIs: ${Array.from(this.cliPaths.keys()).join(', ')}`)
  }

  /**
   * Get the next CLI configuration to try
   * @deprecated Use modelSelector.getNext() internally
   */
  getNextCliConfig(): CliConfig {
    const model = this.modelSelector.getNext()
    if (!model) {
      // Return first available as fallback
      const allModels = this.modelSelector.getAllModels()
      return allModels[0] as CliConfig
    }
    return model as CliConfig
  }

  /**
   * Switch to fallback model pool
   */
  switchToFallback(): void {
    if (!this.modelSelector.isUsingFallback()) {
      this.modelSelector.switchToFallback()
      logger.warn('Switching to fallback models')
    }
  }

  /**
   * Reset to primary model pool
   */
  resetFallback(): void {
    this.modelSelector.resetToFallback()
  }

  /**
   * Kill current subprocess if running
   */
  killCurrent(): void {
    if (this.currentSubprocess) {
      this.currentSubprocess.kill('SIGTERM')
      this.currentSubprocess = null
    }
  }

  /**
   * Execute a prompt using the CLI
   *
   * @param prompt - The prompt to send to the CLI
   * @param outputFile - File path to write CLI output
   * @param timeoutSecs - Default timeout in seconds (can be overridden per-model)
   * @returns Exit code (0 for success)
   */
  async execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number
  ): Promise<number> {
    const promptFile = path.join(path.dirname(outputFile), 'current-prompt.md')
    fs.writeFileSync(promptFile, prompt)

    const maxAttempts = this.modelSelector.getTotalModelCount()
    let rateLimitAttempt = 0

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const modelConfig = this.modelSelector.getNext()
      if (!modelConfig) {
        break
      }

      const modelName = modelConfig.displayName || modelConfig.name
      // Show both CLI runner and model name (e.g., "opencode/gemini-flash" or "claude")
      const displayName = modelConfig.cli === 'claude' ? modelName : `${modelConfig.cli}/${modelName}`
      const cliPath = this.cliPaths.get(modelConfig.cli)

      if (!cliPath) {
        logger.debug(`CLI ${modelConfig.cli} not available, skipping`)
        continue
      }

      // Use per-model timeout if configured, otherwise use default
      const effectiveTimeout = modelConfig.timeout ?? timeoutSecs

      // Build environment with per-model env vars
      const env = { ...process.env, ...modelConfig.env }

      // Build CLI arguments
      let args: string[]

      if (modelConfig.cli === 'opencode') {
        env['OPENCODE_PERMISSION'] = '{"*":"allow"}'
        args = ['run', '--model', modelConfig.model, prompt]
      } else if (modelConfig.cli === 'gemini') {
        args = ['--model', modelConfig.model, prompt]
      } else {
        // claude
        args = ['-p', '--dangerously-skip-permissions', '--model', modelConfig.model]
      }

      // Add per-model custom args if configured
      if (modelConfig.args && modelConfig.args.length > 0) {
        args.push(...modelConfig.args)
      }

      // Show command being executed
      const cmdDisplay = modelConfig.cli === 'opencode'
        ? `opencode run --model ${modelConfig.model} "<prompt>"`
        : modelConfig.cli === 'gemini'
          ? `gemini --model ${modelConfig.model} "<prompt>"`
          : `claude -p --dangerously-skip-permissions --model ${modelConfig.model}`

      logger.info(`[${displayName}] Executing: ${cmdDisplay}`)
      logger.info(`[${displayName}] Timeout: ${effectiveTimeout}s`)
      logger.info(`[${displayName}] Log file: ${outputFile}`)
      logger.info('─────────────────────────────────────')
      logger.info('📝 Streaming CLI output below...')
      logger.info('─────────────────────────────────────')

      const result = await this.spawnWithTimeout(
        cliPath,
        args,
        {
          env,
          input: modelConfig.cli === 'claude' ? prompt : undefined,
          prefix: displayName,
        },
        outputFile,
        effectiveTimeout
      )

      if (result.timedOut) {
        logger.error(`Timed out after ${effectiveTimeout}s with ${displayName}`)
        if (modelConfig.timeout) {
          logger.info(`💡 This model has custom timeout: ${modelConfig.timeout}s`)
        } else {
          logger.info(`💡 Consider increasing timeout in config: timeout: ${Math.ceil(effectiveTimeout * 1.5)}`)
        }
        continue
      }

      // Check for rate limits
      const output = fs.existsSync(outputFile)
        ? fs.readFileSync(outputFile, 'utf-8').slice(-2000)
        : ''

      if (/rate.*limit|too.*many.*request|429|RESOURCE_EXHAUSTED/i.test(output)) {
        // Calculate wait time with optional backoff
        const waitMs = this.retryConfig.exponentialBackoff
          ? calculateBackoffDelay(rateLimitAttempt, this.retryConfig.baseDelayMs, this.retryConfig.maxDelayMs)
          : this.retryConfig.rateLimitWaitMs

        logger.warn(`Rate limit reached for ${displayName}, waiting ${waitMs / 1000} seconds...`)
        logger.info('💡 Consider upgrading API tier for higher limits')

        await new Promise(r => setTimeout(r, waitMs))
        rateLimitAttempt++

        // Retry same model if configured
        if (this.retryConfig.retrySameModel) {
          const retryCount = this.modelSelector.trackRetry(modelConfig.name)
          if (retryCount < this.retryConfig.maxRetriesPerModel) {
            attempt-- // Don't count this as a full attempt
          }
        }
        continue
      }

      if (/quota.*exceed|billing.*limit/i.test(output)) {
        logger.warn(`Quota exhausted for ${displayName}, switching to fallback models`)
        logger.info('💡 Check your billing status and payment method')
        this.switchToFallback()
        continue
      }

      if (result.exitCode === 0) {
        return 0
      }

      // Non-zero exit, potentially switch to fallback
      const primaryCount = (this.cliConfig.models ?? EXEC_MODELS).length
      if (attempt >= primaryCount - 1 && !this.modelSelector.isUsingFallback()) {
        this.switchToFallback()
      }
    }

    // All attempts exhausted
    const allModels = this.modelSelector.getAllModels()
    const triedConfigs = allModels
      .filter(cfg => this.cliPaths.has(cfg.cli))
      .map(cfg => `${cfg.cli}/${cfg.model}`)
      .join(', ')

    throw new LoopworkError(
      'All CLI configurations failed after exhausting all models',
      [
        `Tried the following configurations: ${triedConfigs}`,
        '',
        'Possible causes:',
        '  • Invalid or expired API credentials',
        '  • Network connectivity issues',
        '  • API service outage',
        '  • Insufficient permissions for CLI execution',
        '',
        'Recovery steps:',
        '  1. Verify your API keys are valid and not expired',
        '  2. Check network connectivity: curl -I https://api.anthropic.com',
        '  3. Review the log file for specific error messages',
        '  4. Try running the CLI manually to test authentication',
        '  5. Check API status pages for service outages'
      ]
    )
  }

  private spawnWithTimeout(
    command: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv; input?: string; prefix?: string },
    outputFile: string,
    timeoutSecs: number
  ): Promise<{ exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
      const writeStream = fs.createWriteStream(outputFile)
      let timedOut = false
      const startTime = Date.now()
      const streamLogger = new StreamLogger(options.prefix)

      const child = spawn(command, args, {
        env: options.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      this.currentSubprocess = child

      const progressInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const _remaining = Math.max(0, timeoutSecs - elapsed)
        const percent = Math.min(100, Math.floor((elapsed / timeoutSecs) * 100))

        const barWidth = 10
        const filledWidth = Math.max(0, Math.floor((percent / 100) * barWidth) - 1)
        const bar = '[' + '='.repeat(filledWidth) + '>' + ' '.repeat(Math.max(0, barWidth - filledWidth - 1)) + ']'

        logger.update(`${bar} ${percent}% | ${options.prefix || 'CLI'} | ${elapsed}s elapsed (timeout ${timeoutSecs}s)`)
      }, this.progressIntervalMs)

      child.stdout?.on('data', (data) => {
        writeStream.write(data)
        streamLogger.log(data)
      })

      child.stderr?.on('data', (data) => {
        writeStream.write(data)
        streamLogger.log(data)
      })

      if (child.stdin) {
        if (options.input) {
          child.stdin.write(options.input)
        }
        child.stdin.end()
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), this.sigkillDelayMs)
      }, timeoutSecs * 1000)

      child.on('close', (code) => {
        clearInterval(progressInterval)
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentSubprocess = null
        const totalTime = Math.floor((Date.now() - startTime) / 1000)
        const minutes = Math.floor(totalTime / 60)
        const seconds = totalTime % 60
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

        // Get final file size
        let finalSize = 'N/A'
        try {
          if (fs.existsSync(outputFile)) {
            const stats = fs.statSync(outputFile)
            const sizeKB = (stats.size / 1024).toFixed(1)
            finalSize = `${sizeKB} KB`
          }
        } catch {}

        logger.info('─────────────────────────────────────')
        logger.info(`✓ CLI execution completed in ${timeStr}`)
        logger.info(`Exit code: ${code ?? 1}`)
        logger.info(`Output size: ${finalSize}`)
        logger.info(`Log file: ${outputFile}`)
        logger.info('─────────────────────────────────────')
        resolve({ exitCode: code ?? 1, timedOut })
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearInterval(progressInterval)
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentSubprocess = null

        // Provide specific error messages based on error code
        const errorDetails: Record<string, string[]> = {
          ENOENT: [
            'The CLI executable was not found at the specified path',
            `Check if the file exists: ls -la ${command}`,
            'Verify the CLI is properly installed',
            'Try reinstalling the CLI tool'
          ],
          EACCES: [
            'Permission denied when trying to execute the CLI',
            `Make the file executable: chmod +x ${command}`,
            `Check file permissions: ls -la ${command}`,
            'Ensure you have execute permissions for the CLI'
          ],
          ENOMEM: [
            'Out of memory while trying to spawn the CLI process',
            'Free up system memory by closing other applications',
            'Check system memory usage: free -h (Linux) or vm_stat (macOS)',
            'Consider increasing available system memory'
          ]
        }

        const suggestions = errorDetails[err.code || ''] || [
          'An unexpected error occurred while spawning the CLI process',
          'Check system resources and try again',
          `Error code: ${err.code || 'unknown'}`
        ]

        logger.error(`CLI spawn failed: ${err.message}`)
        suggestions.forEach(s => logger.info(`💡 ${s}`))

        resolve({ exitCode: 1, timedOut: false })
      })
    })
  }
}
