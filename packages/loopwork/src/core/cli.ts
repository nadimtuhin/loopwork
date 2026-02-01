import { spawnSync, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { logger, StreamLogger } from './utils'
import { Debugger } from './debugger'
import type { PrePromptEvent } from '../contracts/debugger'
import type { Config } from './config'
import { LoopworkError } from './errors'
import { PROGRESS_UPDATE_INTERVAL_MS, SIGKILL_DELAY_MS } from './constants'

// Minimum available memory (in MB) required to spawn a new CLI process
const MIN_FREE_MEMORY_MB = 512

/**
 * Get available memory in MB (platform-aware)
 *
 * On macOS, os.freemem() returns only truly "free" pages which is always low
 * because macOS aggressively caches. We need to calculate available memory
 * as: free + inactive + purgeable (file cache that can be reclaimed).
 *
 * On Linux/Windows, os.freemem() is more accurate.
 */
function getAvailableMemoryMB(): number {
  if (process.platform === 'darwin') {
    try {
      // Use vm_stat to get memory info on macOS
      const vmstat = execSync('vm_stat', { encoding: 'utf-8' })
      const pageSize = 16384 // Default page size on Apple Silicon, 4096 on Intel

      // Parse vm_stat output
      const getValue = (key: string): number => {
        const match = vmstat.match(new RegExp(`${key}:\\s+(\\d+)`))
        return match ? parseInt(match[1], 10) : 0
      }

      const freePages = getValue('Pages free')
      const inactivePages = getValue('Pages inactive')
      const purgeablePages = getValue('Pages purgeable')
      const speculativePages = getValue('Pages speculative')

      // Available = free + inactive + purgeable + speculative
      // These are all pages that can be reclaimed for new processes
      const availablePages = freePages + inactivePages + purgeablePages + speculativePages

      // Try to detect actual page size
      let actualPageSize = pageSize
      const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/)
      if (pageSizeMatch) {
        actualPageSize = parseInt(pageSizeMatch[1], 10)
      }

      return Math.round((availablePages * actualPageSize) / (1024 * 1024))
    } catch {
      // Fallback to os.freemem() if vm_stat fails
      return Math.round(os.freemem() / (1024 * 1024))
    }
  }

  // On Linux/Windows, os.freemem() is reasonable
  return Math.round(os.freemem() / (1024 * 1024))
}
import type {
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliType,
} from '../contracts/cli'
import type {
  StepEvent,
  ToolCallEvent,
  AgentResponseEvent,
  CliResultEvent,
} from '../contracts/plugin'
import { DEFAULT_RETRY_CONFIG, DEFAULT_CLI_EXECUTOR_CONFIG } from '../contracts/cli'
import { ModelSelector, calculateBackoffDelay } from './model-selector'
import type { ProcessSpawner, SpawnedProcess } from '../contracts/spawner'
import { createSpawner } from './spawners'
import type { IProcessManager } from '../contracts/process-manager'
import { createProcessManager } from './process-management/process-manager'
import { WorkerPoolManager, type WorkerPoolConfig } from './isolation/WorkerPoolManager'
import { plugins } from '../plugins'

import type { Task } from '../contracts/task'

/**
 * Legacy CliConfig interface for backward compatibility
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

/**
 * Options for CliExecutor constructor
 */
export interface CliExecutorOptions {
  /**
   * Custom process spawner for dependency injection
   * If not provided, uses the default spawner based on preferPty config
   * @deprecated Use processManager instead
   */
  spawner?: ProcessSpawner

  /**
   * Custom process manager for dependency injection
   * If not provided, creates a default ProcessManager with the configured spawner
   */
  processManager?: IProcessManager
  debugger?: Debugger
  /**
   * Checkpoint integrator for automatic checkpoint creation during CLI execution
   * If provided, checkpoints will be created at strategic points in CLI lifecycle
   */
  checkpointIntegrator?: import('./checkpoint-integrator').CheckpointIntegrator
}

export class CliExecutor {
  private cliPaths: Map<string, string> = new Map()
  private currentProcess: SpawnedProcess | null = null
  private modelSelector: ModelSelector
  private cliConfig: CliExecutorConfig
  private retryConfig: Required<RetryConfig>
  private spawner: ProcessSpawner
  private processManager: IProcessManager
  private debugger?: Debugger
  private poolManager: WorkerPoolManager
  private checkpointIntegrator?: import('./checkpoint-integrator').CheckpointIntegrator
  private lastCliCheckpointTime?: number
  private resourceExhaustedPids: Map<number, string> = new Map()

  // Timing configuration
  private sigkillDelayMs: number
  private progressIntervalMs: number

  constructor(private config: Config, options?: CliExecutorOptions) {
    // Merge default config with user config
    this.cliConfig = {
      ...DEFAULT_CLI_EXECUTOR_CONFIG,
      ...config.cliConfig,
    }

    this.debugger = options?.debugger
    this.checkpointIntegrator = options?.checkpointIntegrator

    // Merge retry config
    this.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...this.cliConfig.retry,
    }

    // Set timing values
    this.sigkillDelayMs = this.cliConfig.sigkillDelayMs ?? SIGKILL_DELAY_MS
    this.progressIntervalMs = this.cliConfig.progressIntervalMs ?? PROGRESS_UPDATE_INTERVAL_MS

    // Initialize spawner (use provided or create default based on preferPty config)
    const preferPty = this.cliConfig.preferPty ?? true
    this.spawner = options?.spawner ?? createSpawner(preferPty)
    logger.debug(`Spawner initialized: ${this.spawner.name} (preferPty: ${preferPty})`)

    // Initialize process manager
    // If processManager provided, use it; otherwise create one with the spawner
    this.processManager = options?.processManager ?? createProcessManager({
      spawner: this.spawner,
      staleTimeoutMs: (this.config.timeout ?? 600) * 1000 * 2, // 2x CLI timeout
      gracePeriodMs: this.sigkillDelayMs,
    })

    // Detect CLI paths
    this.detectClis()

    // Initialize model selector with configured or default models
    const primaryModels = this.cliConfig.models ?? EXEC_MODELS
    const fallbackModels = this.cliConfig.fallbackModels ?? FALLBACK_MODELS
    const strategy = this.cliConfig.selectionStrategy ?? 'round-robin'

    this.modelSelector = new ModelSelector(primaryModels, fallbackModels, strategy)

    // Initialize worker pool manager with configured or default pools
    const poolConfig: WorkerPoolConfig = this.config.workerPools || {
      pools: {
        'high': { size: 2, nice: 0, memoryLimitMB: 2048 },
        'medium': { size: 5, nice: 5, memoryLimitMB: 1024 },
        'low': { size: 2, nice: 10, memoryLimitMB: 512 },
        'background': { size: 1, nice: 15, memoryLimitMB: 256 },
      },
      defaultPool: 'medium'
    }
    this.poolManager = new WorkerPoolManager(poolConfig, {
      onTerminateProcess: async (pid: number, reason: string) => {
        logger.error(`[ResourceLimit] Terminating process ${pid}: ${reason}`)
        this.resourceExhaustedPids.set(pid, reason)
        this.processManager.kill(pid, 'SIGKILL')
      }
    })
    const poolDetails = Object.entries(poolConfig.pools).map(([name, config]) => `${name}(${config.size})`).join(', ')
    logger.debug(`WorkerPoolManager initialized with pools: ${poolDetails}`)

    if (this.config.flags?.forceFallback) {
      this.switchToFallback()
    }
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
        'ERR_CLI_NOT_FOUND',
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
        'ERR_CLI_NOT_FOUND',
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
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
  }

  /**
   * Clean up all tracked processes and persist state
   * Should be called before process exit
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up tracked processes...')

    // Kill current process if running
    this.killCurrent()

    // Shutdown pool manager and resource monitors
    this.poolManager.shutdown()

    // Detect and clean orphans
    const result = await this.processManager.cleanup()

    if (result.cleaned.length > 0) {
      logger.info(`Cleaned up ${result.cleaned.length} orphan process(es)`)
    }

    if (result.failed.length > 0) {
      logger.warn(`Failed to clean ${result.failed.length} process(es)`)
      result.errors.forEach(e => logger.debug(`PID ${e.pid}: ${e.error}`))
    }

    // Persist final state
    await this.processManager.persist()
  }

  /**
   * Get process manager for external access
   */
  getProcessManager(): IProcessManager {
    return this.processManager
  }

  /**
   * Determine pool name based on task metadata
   * Priority: Feature-specific pool > Priority-based pool > Default pool
   */
  private getPoolForTask(taskId?: string, priority?: string, feature?: string): string {
    // If a dedicated pool exists for this feature, use it
    if (feature && this.poolManager.getStats()[feature]) {
      return feature
    }

    if (priority === 'high') {
      return 'high'
    } else if (priority === 'low') {
      return 'low'
    } else if (priority === 'background') {
      return 'background'
    }
    return 'medium'
  }

  /**
   * Get pool manager for external access and metrics
   */
  getPoolManager(): WorkerPoolManager {
    return this.poolManager
  }

  /**
   * Execute a task using the appropriate pool and CLI
   */
  async executeTask(
    task: Task,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    workerId?: number,
    permissions?: Record<string, string>
  ): Promise<number> {
    return this.execute(
      prompt,
      outputFile,
      timeoutSecs,
      task.id,
      workerId,
      permissions,
      task.priority,
      task.feature
    )
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
    timeoutSecs: number,
    taskId?: string,
    workerId?: number,
    permissions?: Record<string, string>,
    priority?: string,
    feature?: string
  ): Promise<number> {
    const capabilities = plugins.getCapabilityRegistry().getPromptInjection()
    let finalPrompt = capabilities
      ? `${prompt}\n\n# Plugin Capabilities\n\n${capabilities}`
      : prompt

    const promptFile = path.join(path.dirname(outputFile), 'current-prompt.md')
    fs.writeFileSync(promptFile, finalPrompt)

    // Emit step event: execution start
    const executionStartTime = Date.now()
    await plugins.runHook('onStep', {
      stepId: 'cli_execution_start',
      description: 'Starting CLI execution',
      phase: 'start',
      context: { taskId, poolName: this.getPoolForTask(taskId, priority, feature) }
    } as StepEvent)

    // Determine pool based on priority/feature
    const poolName = this.getPoolForTask(taskId, priority, feature)
    logger.info(`[Pool:${poolName}] Assigned for task ${taskId || 'unknown'}`)

    // Acquire slot from appropriate pool
    let slotPid: number
    try {
      slotPid = await this.poolManager.acquire(poolName)
      logger.debug(`[Pool:${poolName}] Slot acquired (PID: ${slotPid}) for task ${taskId || 'unknown'}`)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.error(`[Pool:${poolName}] Failed to acquire slot: ${error.message}`)
      throw new LoopworkError(
        'ERR_POOL_SLOT_TIMEOUT',
        `Could not acquire worker pool slot for ${poolName} priority tasks`,
        [
          'The worker pool is at capacity and queue is full',
          'Wait for other tasks to complete or increase pool size',
          'Check pool configuration in loopwork.config.ts'
        ]
      )
    }

    try {
      const maxAttempts = this.modelSelector.getTotalModelCount()
      let rateLimitAttempt = 0

      // Checkpoint: Pre-execution (before starting model attempts)
      if (taskId) {
        await this.checkpointCli(taskId, 0, {
          phase: 'pre-execution',
          prompt: finalPrompt.substring(0, 500), // Truncate long prompts
          poolName,
          timestamp: Date.now()
        })
      }

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const modelConfig = this.modelSelector.getNext()
        if (!modelConfig) {
          break
        }

        const modelName = modelConfig.displayName || modelConfig.name
        // Show both CLI runner and model name (e.g., "opencode/gemini-flash" or "claude")
        const displayName = modelConfig.cli === 'claude' ? modelName : `${modelConfig.cli}/${modelName}`
        const cliPath = this.cliPaths.get(modelConfig.cli)

        // Emit step event: model selected
        await plugins.runHook('onStep', {
          stepId: 'model_selected',
          description: `Model selected: ${displayName}`,
          phase: 'start',
          context: { taskId, model: displayName, cli: modelConfig.cli, attempt: attempt + 1, maxAttempts }
        } as StepEvent)

        if (!cliPath) {
          logger.debug(`CLI ${modelConfig.cli} not available, skipping`)
          continue
        }

        // Use per-model timeout if configured, otherwise use default
        const effectiveTimeout = modelConfig.timeout ?? timeoutSecs

        // Build environment with per-model env vars and dynamic permissions
        const env = { ...process.env, ...modelConfig.env, ...permissions }

        // Build CLI arguments
        let args: string[] = []

        if (modelConfig.cli === 'opencode') {
          if (!env['OPENCODE_PERMISSION']) {
            env['OPENCODE_PERMISSION'] = '{"*":"allow"}'
          }
          args = ['run', '--model', modelConfig.model, finalPrompt]
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

        // Emit tool call event
        await plugins.runHook('onToolCall', {
          toolName: modelConfig.cli,
          arguments: {
            model: modelConfig.model,
            cli: modelConfig.cli,
            timeout: effectiveTimeout,
            hasInput: modelConfig.cli === 'claude',
          },
          taskId,
          timestamp: Date.now(),
          metadata: {
            displayName,
            attempt: attempt + 1,
            maxAttempts,
          }
        } as ToolCallEvent)

        if (this.debugger) {
          const prePromptEvent: PrePromptEvent = {
            type: 'PRE_PROMPT',
            taskId,
            timestamp: Date.now(),
            prompt: finalPrompt,
            data: { model: displayName, cli: modelConfig.cli, modelId: modelConfig.model }
          }
          await this.debugger.onEvent(prePromptEvent)

          const modifiedPrompt = this.debugger.getAndClearModifiedPrompt()
          if (modifiedPrompt !== undefined) {
            finalPrompt = modifiedPrompt
            fs.writeFileSync(promptFile, finalPrompt)
            logger.info(`[${displayName}] Using modified prompt from debugger`)
          }
        }

        logger.info('─────────────────────────────────────')
        logger.info('📝 Streaming CLI output below...')
        logger.info('─────────────────────────────────────')

        // Emit step event: spawn start
        await plugins.runHook('onStep', {
          stepId: 'cli_spawn_start',
          description: `Spawning CLI process for ${displayName}`,
          phase: 'start',
          context: { taskId, model: displayName, timeout: effectiveTimeout }
        } as StepEvent)

        const startTime = Date.now()
        const result = await this.spawnWithTimeout(
          cliPath,
          args,
          {
            env,
            input: modelConfig.cli === 'claude' ? finalPrompt : undefined,
            prefix: displayName,
            taskId,
            workerId,
            poolName,
          },
          outputFile,
          effectiveTimeout
        )
        const spawnDuration = Date.now() - startTime

        let fullOutput = ''
        try {
          if (fs.existsSync(outputFile)) {
            fullOutput = fs.readFileSync(outputFile, 'utf-8')
          }
        } catch {}

        await plugins.runHook('onCliResult', {
          taskId,
          model: displayName,
          cli: modelConfig.cli,
          exitCode: result.exitCode,
          durationMs: spawnDuration,
          output: fullOutput,
          timedOut: result.timedOut,
        } as CliResultEvent)

        await plugins.runHook('onStep', {
          stepId: 'cli_spawn_end',
          description: `CLI process execution completed for ${displayName}`,
          phase: 'end',
          durationMs: spawnDuration,
          context: { taskId, model: displayName, exitCode: result.exitCode, timedOut: result.timedOut }
        } as StepEvent)

        // Checkpoint: Post-spawn (after CLI execution completes)
        if (taskId) {
          await this.checkpointCli(taskId, attempt + 1, {
            phase: 'post-spawn',
            model: displayName,
            cli: modelConfig.cli,
            effectiveTimeout,
            executionTimeMs: spawnDuration,
            timestamp: Date.now()
          })
        }

        if (result.resourceExhausted) {
          throw new LoopworkError(
            'ERR_RESOURCE_EXHAUSTED',
            result.resourceExhausted,
            ['Consider increasing the memory limit for this worker pool', 'Check if the task is causing a memory leak']
          )
        }

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
          // Checkpoint: Pre-completion (successful execution)
          if (taskId) {
            await this.checkpointCli(taskId, attempt + 1, {
              phase: 'pre-completion',
              exitCode: 0,
              model: displayName,
              executionTimeMs: Date.now() - startTime,
              timestamp: Date.now()
            })
          }
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
        'ERR_CLI_EXEC',
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
    } finally {
      // Emit step event: execution end
      const executionDuration = Date.now() - executionStartTime
      await plugins.runHook('onStep', {
        stepId: 'cli_execution_end',
        description: 'CLI execution completed',
        phase: 'end',
        durationMs: executionDuration,
        context: { taskId, poolName }
      } as StepEvent)

      // Log pool utilization metrics before releasing slot
      const stats = this.poolManager.getStats()[poolName]
      if (stats) {
        logger.info(`[Pool:${poolName}] Utilization: ${stats.active}/${stats.limit} active, ${stats.queued} queued`)
      }

      await this.poolManager.release(slotPid)
      logger.debug(`[Pool:${poolName}] Slot released (PID: ${slotPid}) for task ${taskId || 'unknown'}`)
    }
  }

  private spawnWithTimeout(
    command: string,
    args: string[],
    options: { env?: NodeJS.ProcessEnv; input?: string; prefix?: string; taskId?: string; workerId?: number; poolName?: string },
    outputFile: string,
    timeoutSecs: number
  ): Promise<{ exitCode: number; timedOut: boolean; resourceExhausted?: string }> {
    return new Promise((resolve, reject) => {
      // Check available memory before spawning (platform-aware)
      const availableMemoryMB = getAvailableMemoryMB()
      if (availableMemoryMB < MIN_FREE_MEMORY_MB) {
        const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024))
        logger.warn(`Low memory: ${availableMemoryMB}MB available (need ${MIN_FREE_MEMORY_MB}MB). Total: ${totalMemoryMB}MB`)
        return reject(new LoopworkError(
          'ERR_PROCESS_SPAWN',
          `SPAWN_FAILED: Insufficient memory to spawn CLI process: ${availableMemoryMB}MB available (need ${MIN_FREE_MEMORY_MB}MB minimum)`,
          ['Wait for other processes to complete or free up memory']
        ))
      }

      const writeStream = fs.createWriteStream(outputFile)
      let timedOut = false
      const startTime = Date.now()
      let progressInterval: NodeJS.Timeout | null = null
      let lastStreamOutputTime = 0
      const STREAM_SILENCE_THRESHOLD = 3000
      
      const streamLogger = new StreamLogger(options.prefix, (event) => {
        this.debugger?.onEvent({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: event.type as any,
          taskId: options.taskId,
          timestamp: Date.now(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: event.data as any
        })
      })

      // Wire up debugger state changes to stream logger
      const debuggerListener = {
        onPause: () => streamLogger.pause(),
        onResume: () => streamLogger.resume()
      }
      this.debugger?.addListener(debuggerListener)

      // Get pool-specific settings
      const poolConfig = this.poolManager.getPoolConfig(options.poolName || 'medium')

      // Spawn via process manager for automatic tracking
      logger.debug(`Spawning ${command} with spawner: ${this.spawner.name} (available memory: ${availableMemoryMB}MB, nice: ${poolConfig.nice || 'default'})`)
      const child = this.processManager.spawn(command, args, {
        env: options.env,
        nice: poolConfig.nice,
      })

      this.currentProcess = child

      // Track additional metadata if process has PID
      if (child.pid) {
        if (options.taskId) {
          this.processManager.track(child.pid, {
            command,
            args,
            namespace: this.config.namespace || 'loopwork',
            taskId: options.taskId,
            startTime: Date.now(),
          })
        }

        // Track in worker pool for resource monitoring
        this.poolManager.trackProcess(child.pid, options.poolName || 'medium', options.taskId, options.workerId)
      }

      const startProgressInterval = () => {
        if (progressInterval) return
        
        progressInterval = setInterval(() => {
          const timeSinceLastOutput = Date.now() - lastStreamOutputTime
          
          if (lastStreamOutputTime > 0 && timeSinceLastOutput < STREAM_SILENCE_THRESHOLD) {
            return
          }

          const elapsed = Math.floor((Date.now() - startTime) / 1000)

          const workerInfo = options.workerId !== undefined ? ` | worker ${options.workerId}` : ''
          const message = `${options.prefix || 'CLI'} | ${elapsed}s elapsed (timeout ${timeoutSecs}s)${workerInfo}`
          logger.update(message)
        }, this.progressIntervalMs)
      }
      
      const stopProgressInterval = () => {
        if (progressInterval !== null) {
          clearInterval(progressInterval)
          progressInterval = null
        }
      }
      
      logger.startSpinner(`${options.prefix || 'CLI'} starting...`)
      startProgressInterval()

      // Handle stdout (always available)
      child.stdout?.on('data', (data) => {
        lastStreamOutputTime = Date.now()
        writeStream.write(data)
        streamLogger.log(data)

        const responseText = data.toString('utf-8')
        plugins.runHook('onAgentResponse', {
          responseText,
          model: options.prefix,
          taskId: options.taskId,
          timestamp: Date.now(),
          isPartial: true,
        } as AgentResponseEvent).catch((error) => {
          logger.debug(`Agent response hook error: ${error}`)
        })
      })

      // Handle stderr (may be null for PTY spawner - stderr merged into stdout)
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          lastStreamOutputTime = Date.now()
          writeStream.write(data)
          streamLogger.log(data)

          const responseText = data.toString('utf-8')
          plugins.runHook('onAgentResponse', {
            responseText,
            model: options.prefix,
            taskId: options.taskId,
            timestamp: Date.now(),
            isPartial: true,
          } as AgentResponseEvent).catch((error) => {
            logger.debug(`Agent response hook error: ${error}`)
          })
        })
      }

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
        stopProgressInterval()
        logger.stopSpinner()
        clearTimeout(timer)
        this.debugger?.removeListener(debuggerListener)
        streamLogger.flush()
        writeStream.end()
        this.currentProcess = null

        const pid = child.pid
        if (pid) {
          this.poolManager.untrackProcess(pid)
        }

        const exhaustionReason = pid ? this.resourceExhaustedPids.get(pid) : undefined
        if (exhaustionReason && pid) {
          this.resourceExhaustedPids.delete(pid)
        }

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
        if (exhaustionReason) {
          logger.error(`FAILED: ${exhaustionReason}`)
        } else {
          logger.info(`Exit code: ${code ?? 1}`)
        }
        logger.info(`Output size: ${finalSize}`)
        logger.info(`Log file: ${outputFile}`)
        logger.info('─────────────────────────────────────')

        // Emit final agent response event
        plugins.runHook('onAgentResponse', {
          responseText: '', // Completion signal
          model: options.prefix,
          taskId: options.taskId,
          timestamp: Date.now(),
          isPartial: false,
        } as AgentResponseEvent).catch((error) => {
          logger.debug(`Agent response hook error: ${error}`)
        })

        resolve({
          exitCode: exhaustionReason ? 1 : (code ?? 1),
          timedOut,
          resourceExhausted: exhaustionReason
        })
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        stopProgressInterval()
        logger.stopSpinner()
        clearTimeout(timer)
        this.debugger?.removeListener(debuggerListener)
        streamLogger.flush()
        writeStream.end()
        this.currentProcess = null

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

  /**
   * Create a checkpoint during CLI execution with throttling
   * Non-blocking - errors are logged but not thrown
   */
  private async checkpointCli(
    taskId: string,
    iteration: number,
    context: Record<string, unknown>
  ): Promise<void> {
    if (!this.checkpointIntegrator) return

    const config = this.config.checkpoint
    if (!config?.enabled) return
    if (config.skipOnCliExecution) return

    // Throttle based on time interval
    const now = Date.now()
    const intervalMs = (config.cliCheckpointIntervalSecs ?? 60) * 1000
    if (this.lastCliCheckpointTime && (now - this.lastCliCheckpointTime) < intervalMs) {
      return
    }

    try {
      await this.checkpointIntegrator.checkpoint({
        taskId: `cli-${taskId}`,
        iteration,
        context: {
          type: 'cli-execution',
          ...context
        },
        memory: {}
      })
      this.lastCliCheckpointTime = now
      logger.debug(`CLI checkpoint created for task ${taskId}`)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      logger.warn(`CLI checkpoint failed: ${error.message}`)
      // Non-blocking - don't throw
    }
  }
}
