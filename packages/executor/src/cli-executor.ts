import { spawnSync, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { StreamLogger } from '@loopwork-ai/common'
import { 
  isRateLimitOutput, 
  createResilienceRunner, 
  RateLimitError,
} from '@loopwork-ai/resilience'
import type { 
  ILogger, 
  IProcessManager, 
  ISpawnedProcess, 
  ISpawner,
  IPluginRegistry,
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliType,
  ExecutionOptions,
  ITaskMinimal,
  ICliStrategyRegistry
} from '@loopwork-ai/contracts'
import { ModelSelector } from './model-selector'
import { WorkerPoolManager, type WorkerPoolConfig } from './isolation/worker-pool-manager'
import { createSpawner } from './spawners'
import { CliHealthChecker, type ValidatedModelConfig } from './cli-health-checker'
import { createDefaultRegistry } from './strategies'

const MIN_FREE_MEMORY_MB = 512
const DEFAULT_SIGKILL_DELAY_MS = 5000

export function clearOpenCodeCache(logger?: ILogger): boolean {
  const homeDir = os.homedir()
  const cachePath = path.join(homeDir, '.cache', 'opencode')
  
  try {
    const nodeModulesPath = path.join(cachePath, 'node_modules')
    const bunLockPath = path.join(cachePath, 'bun.lock')
    
    if (fs.existsSync(nodeModulesPath)) {
      fs.rmSync(nodeModulesPath, { recursive: true, force: true })
      logger?.warn?.(`Cleared corrupted OpenCode cache: ${nodeModulesPath}`)
    }
    
    if (fs.existsSync(bunLockPath)) {
      fs.unlinkSync(bunLockPath)
      logger?.warn?.(`Cleared OpenCode lock file: ${bunLockPath}`)
    }
    
    return true
  } catch (error) {
    logger?.error?.(`Failed to clear OpenCode cache: ${error}`)
    return false
  }
}

/**
 * Custom error for OpenCode cache corruption
 */
export class OpenCodeCacheError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenCodeCacheError'
  }
}

function getAvailableMemoryMB(): number {
  if (process.platform === 'darwin') {
    try {
      const vmstat = execSync('vm_stat', { encoding: 'utf-8' })
      const getValue = (key: string): number => {
        const match = vmstat.match(new RegExp(`${key}:\\s+(\\d+)`))
        return match ? parseInt(match[1], 10) : 0
      }

      const freePages = getValue('Pages free')
      const inactivePages = getValue('Pages inactive')
      const purgeablePages = getValue('Pages purgeable')
      const speculativePages = getValue('Pages speculative')
      const availablePages = freePages + inactivePages + purgeablePages + speculativePages

      let actualPageSize = 16384
      const pageSizeMatch = vmstat.match(/page size of (\d+) bytes/)
      if (pageSizeMatch) {
        actualPageSize = parseInt(pageSizeMatch[1], 10)
      }

      return Math.round((availablePages * actualPageSize) / (1024 * 1024))
    } catch {
      return Math.round(os.freemem() / (1024 * 1024))
    }
  }
  return Math.round(os.freemem() / (1024 * 1024))
}

export const EXEC_MODELS: ModelConfig[] = [
  { name: 'sonnet-claude', displayName: 'claude', cli: 'claude', model: 'sonnet' },
  { name: 'sonnet-opencode', displayName: 'sonnet', cli: 'opencode', model: 'google/antigravity-claude-sonnet-4-5' },
  { name: 'gemini-3-flash', displayName: 'gemini-flash', cli: 'opencode', model: 'google/antigravity-gemini-3-flash' },
]

export const FALLBACK_MODELS: ModelConfig[] = [
  { name: 'opus-claude', displayName: 'opus', cli: 'claude', model: 'opus' },
  { name: 'gemini-3-pro', displayName: 'gemini-pro', cli: 'opencode', model: 'google/antigravity-gemini-3-pro' },
]

const CLI_PATH_ENV_VARS: Record<CliType, string> = {
  claude: 'LOOPWORK_CLAUDE_PATH',
  opencode: 'LOOPWORK_OPENCODE_PATH',
  gemini: 'LOOPWORK_GEMINI_PATH',
  droid: 'LOOPWORK_DROID_PATH',
  crush: 'LOOPWORK_CRUSH_PATH',
  kimi: 'LOOPWORK_KIMI_PATH',
  kilocode: 'LOOPWORK_KILOCODE_PATH',
}

export interface CliExecutorOptions {
  debugger?: any
  checkpointIntegrator?: any
}

export class CliExecutor {
  private cliPaths: Map<string, string> = new Map()
  private currentProcess: ISpawnedProcess | null = null
  private modelSelector: ModelSelector
  private retryConfig: Required<RetryConfig>
  private spawner: ISpawner
  private poolManager: WorkerPoolManager
  private resourceExhaustedPids: Map<number, string> = new Map()
  private healthChecker: CliHealthChecker
  private preflightValidated = false
  private strategyRegistry: ICliStrategyRegistry

  constructor(
    protected config: CliExecutorConfig,
    protected processManager: IProcessManager,
    protected pluginRegistry: IPluginRegistry,
    protected logger: ILogger,
    protected options: CliExecutorOptions = {}
  ) {
    this.retryConfig = {
      rateLimitWaitMs: 30000,
      exponentialBackoff: true,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
      retrySameModel: true,
      maxRetriesPerModel: 3,
      delayBetweenModelAttemptsMs: 2000,
      ...config.retry,
    }

    const preferPty = config.preferPty ?? true
    this.spawner = createSpawner(preferPty)
    
    this.detectClis()

    const primaryModels = config.models ?? EXEC_MODELS
    const fallbackModels = config.fallbackModels ?? FALLBACK_MODELS
    const strategy = config.selectionStrategy ?? 'round-robin'

    this.modelSelector = new ModelSelector(primaryModels, fallbackModels, strategy, {
      enableCircuitBreaker: true,
      failureThreshold: 3,
      resetTimeoutMs: 300000, // 5 minutes
    })

    this.healthChecker = new CliHealthChecker({
      testTimeoutMs: 30000,
      maxRetries: 1,
      autoClearCache: true,
      logger: this.logger,
    })

    const poolConfig: WorkerPoolConfig = {
      pools: {
        'high': { size: 5, nice: 0, memoryLimitMB: 2048 },
        'medium': { size: 8, nice: 5, memoryLimitMB: 1024 },
        'low': { size: 4, nice: 10, memoryLimitMB: 512 },
        'background': { size: 2, nice: 15, memoryLimitMB: 256 },
      },
      defaultPool: 'medium'
    }

    this.poolManager = new WorkerPoolManager(poolConfig, async (pid: number, reason: string) => {
      this.logger.error(`[ResourceLimit] Terminating process ${pid}: ${reason}`)
      this.resourceExhaustedPids.set(pid, reason)
      this.processManager.kill(pid, { signal: 'SIGKILL' })
    })

    this.strategyRegistry = createDefaultRegistry(this.logger)
  }

  private detectClis(): void {
    const home = process.env.HOME || ''
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
      droid: [
        `${home}/.npm/bin/droid`,
        `${home}/.npm/bin/factory`,
        '/usr/local/bin/droid',
        '/usr/local/bin/factory',
      ],
      crush: [
        '/opt/homebrew/bin/crush',
        '/usr/local/bin/crush',
        `${home}/.npm/bin/crush`,
      ],
      kimi: [
        `${home}/.local/bin/kimi`,
        '/usr/local/bin/kimi',
      ],
      kilocode: [
        `${home}/.npm/bin/kilocode`,
        '/usr/local/bin/kilocode',
      ],
    }

    for (const [cli, defaultPaths] of Object.entries(defaultCandidates)) {
      const cliType = cli as CliType
      const envVar = CLI_PATH_ENV_VARS[cliType]
      const envPath = process.env[envVar]
      
      if (envPath && fs.existsSync(envPath)) {
        this.cliPaths.set(cli, envPath)
        continue
      }

      const configPath = this.config.cliPaths?.[cliType]
      if (configPath && fs.existsSync(configPath)) {
        this.cliPaths.set(cli, configPath)
        continue
      }

      const whichResult = spawnSync('which', [cli], { encoding: 'utf-8' })
      if (whichResult.status === 0 && whichResult.stdout?.trim()) {
        this.cliPaths.set(cli, whichResult.stdout.trim())
        continue
      }

      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          this.cliPaths.set(cli, p)
          break
        }
      }
    }

    if (this.cliPaths.size === 0) {
      throw new Error('No AI CLI tools found in PATH or known locations')
    }
  }

  switchToFallback(): void {
    if (!this.modelSelector.isUsingFallback()) {
      this.modelSelector.switchToFallback()
      this.logger.warn('Switching to fallback models')
    }
  }

  getNextCliConfig(): any {
    return this.modelSelector.getNext()
  }

  getNextModel(): { cli: string; model: string; displayName?: string } | null {
    // Use peek() to get the next model without advancing the selector
    // The actual execution will call getNext() to advance
    const modelConfig = this.modelSelector.peek()
    if (!modelConfig) {
      return null
    }
    const modelName = modelConfig.displayName || modelConfig.name
    const displayName = modelConfig.cli === 'claude' ? modelName : `${modelConfig.cli}/${modelName}`
    return {
      cli: modelConfig.cli,
      model: modelName,
      displayName,
    }
  }

  killCurrent(): void {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM')
      this.currentProcess = null
    }
  }

  async cleanup(): Promise<void> {
    this.killCurrent()
    await this.poolManager.shutdown()
    await this.processManager.cleanup()
  }

  /**
   * Run pre-flight health check on all models
   * Returns validated healthy models and filters the model selector
   */
  async runPreflightValidation(
    minimumRequired: number = 1
  ): Promise<{
    success: boolean
    healthy: ValidatedModelConfig[]
    unhealthy: ValidatedModelConfig[]
    message: string
  }> {
    if (this.preflightValidated) {
      const healthStatus = this.modelSelector.getHealthStatus()
      return {
        success: healthStatus.available >= minimumRequired,
        healthy: [],
        unhealthy: [],
        message: `Using cached validation: ${healthStatus.available}/${healthStatus.total} models available`,
      }
    }

    this.logger.info('[Preflight] Starting CLI health validation...')
    
    const allModels = this.modelSelector.getAllModels()
    const { healthy, unhealthy, summary } = await this.healthChecker.validateAllModels(
      this.cliPaths,
      allModels
    )

    const { sufficient, canContinue } = this.healthChecker.hasMinimumHealthyModels(
      healthy.length,
      minimumRequired
    )

    if (healthy.length > 0) {
      this.logger.info(
        `[Preflight] ${summary.healthy}/${summary.total} models healthy` +
          (summary.cacheCleared > 0 ? ` (${summary.cacheCleared} cache cleared)` : '')
      )

      if (unhealthy.length > 0) {
        this.logger.warn(
          `[Preflight] Disabled models: ${unhealthy.map(u => u.name).join(', ')}`
        )
      }
    }

    this.preflightValidated = true

    if (!sufficient) {
      const message = canContinue
        ? `Only ${summary.healthy}/${summary.total} models healthy (minimum ${minimumRequired} recommended)`
        : `CRITICAL: Only ${summary.healthy}/${summary.total} models healthy, need at least ${minimumRequired}`
      
      return {
        success: canContinue,
        healthy,
        unhealthy,
        message,
      }
    }

    return {
      success: true,
      healthy,
      unhealthy,
      message: `All ${summary.healthy} models healthy and ready`,
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): {
    total: number
    available: number
    disabled: number
    preflightComplete: boolean
  } {
    const status = this.modelSelector.getHealthStatus()
    return {
      ...status,
      preflightComplete: this.preflightValidated,
    }
  }

  /**
   * Reset preflight validation (for testing)
   */
  resetPreflight(): void {
    this.preflightValidated = false
    this.healthChecker.clearCache()
    this.modelSelector.reset()
  }

  /**
   * Start progressive validation that enables immediate work with available models
   * Returns immediately with initial available models, continues validating in background
   */
  async startProgressiveValidation(
    minimumRequired: number = 1
  ): Promise<{
    success: boolean
    initiallyAvailable: number
    message: string
    waitForAll: () => Promise<{ totalHealthy: number; totalUnhealthy: number }>
  }> {
    if (this.preflightValidated) {
      const healthStatus = this.modelSelector.getHealthStatus()
      return {
        success: healthStatus.available >= minimumRequired,
        initiallyAvailable: healthStatus.available,
        message: `Using cached validation: ${healthStatus.available}/${healthStatus.total} models available`,
        waitForAll: async () => ({ 
          totalHealthy: healthStatus.available, 
          totalUnhealthy: healthStatus.disabled 
        }),
      }
    }

    this.logger.info('[Preflight] Starting progressive CLI validation...')
    
    const allModels = this.modelSelector.getAllModels()
    
    // Mark all models as pending
    allModels.forEach(m => this.modelSelector.markPending(m.name))
    
    // Track validation progress
    let totalHealthy = 0
    let totalUnhealthy = 0
    let resolveValidationComplete: (value: { totalHealthy: number; totalUnhealthy: number }) => void
    const validationPromise = new Promise<{ totalHealthy: number; totalUnhealthy: number }>((resolve) => {
      resolveValidationComplete = resolve
    })

    // Set up progressive health checker
    const progressiveHealthChecker = new CliHealthChecker({
      testTimeoutMs: 30000,
      maxRetries: 1,
      autoClearCache: true,
      logger: this.logger,
      delayBetweenValidationsMs: 2000,
      // Called immediately when a model passes validation
      onModelHealthy: (validatedModel) => {
        totalHealthy++
        this.modelSelector.addModel(validatedModel)
        this.logger.info(
          `[Preflight] ✓ ${validatedModel.cli}/${validatedModel.name} ready (${totalHealthy} models available)`
        )
      },
      // Called immediately when a model fails validation
      onModelUnhealthy: (validatedModel) => {
        totalUnhealthy++
        this.modelSelector.markModelUnavailable(validatedModel.name)
        this.logger.warn(
          `[Preflight] ✗ ${validatedModel.cli}/${validatedModel.name} failed` +
          (validatedModel.lastError ? `: ${validatedModel.lastError.slice(0, 60)}` : '')
        )
      },
      // Called when all validations are complete
      onValidationComplete: (summary) => {
        this.preflightValidated = true
        this.modelSelector.signalValidationComplete()
        this.logger.info(
          `[Preflight] Validation complete: ${summary.healthy}/${summary.total} models healthy`
        )
        resolveValidationComplete({ totalHealthy, totalUnhealthy })
      },
    })

    // Start validation in background (don't await)
    progressiveHealthChecker.validateAllModels(
      this.cliPaths,
      allModels
    ).catch(() => {})

    // Wait for at least one model to be available or timeout
    const hasAvailable = await this.modelSelector.waitForAvailableModels(30000)
    
    const { canContinue } = this.healthChecker.hasMinimumHealthyModels(
      this.modelSelector.getAvailableModelCount(),
      minimumRequired
    )

    const initialAvailable = this.modelSelector.getAvailableModelCount()

    if (!hasAvailable && !canContinue) {
      // No models available and none pending - wait a bit more
      await new Promise(r => setTimeout(r, 5000))
    }

    if (initialAvailable > 0) {
      this.logger.info(
        `[Preflight] Starting work with ${initialAvailable} available model(s)...` +
        (this.modelSelector.hasPendingModels() ? ' (more coming online)' : '')
      )
    }

    const success = initialAvailable >= minimumRequired || canContinue
    const message = initialAvailable >= minimumRequired
      ? `Starting with ${initialAvailable} models available`
      : canContinue
        ? `Only ${initialAvailable} models available (minimum ${minimumRequired} recommended)`
        : `CRITICAL: No models available`

    return {
      success,
      initiallyAvailable: initialAvailable,
      message,
      waitForAll: async () => validationPromise,
    }
  }

  /**
   * Check if models are still being validated
   */
  isValidationInProgress(): boolean {
    return this.modelSelector.hasPendingModels()
  }

  /**
   * Wait for at least one model to become available
   */
  async waitForAvailableModels(timeoutMs?: number): Promise<boolean> {
    return this.modelSelector.waitForAvailableModels(timeoutMs)
  }

  private getPoolForTask(priority?: string, feature?: string): string {
    if (feature && this.poolManager.getStats()[feature]) {
      return feature
    }
    if (priority === 'high') return 'high'
    if (priority === 'low') return 'low'
    if (priority === 'background') return 'background'
    return 'medium'
  }

  async executeTask(
    task: ITaskMinimal,
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options: ExecutionOptions = {}
  ): Promise<number> {
    return this.execute(
      prompt,
      outputFile,
      timeoutSecs,
      {
        ...options,
        taskId: task.id,
        priority: task.priority,
        feature: task.feature
      }
    )
  }

  async execute(
    prompt: string,
    outputFile: string,
    timeoutSecs: number,
    options: ExecutionOptions = {}
  ): Promise<number> {
    const capabilityRegistry = this.pluginRegistry.getCapabilityRegistry()
    const capabilities = capabilityRegistry.getPromptInjection()
    let finalPrompt = capabilities
      ? `${prompt}\n\n# Plugin Capabilities\n\n${capabilities}`
      : prompt

    const promptFile = path.join(path.dirname(outputFile), 'current-prompt.md')
    fs.writeFileSync(promptFile, finalPrompt)

    await this.pluginRegistry.runHook('onStep', {
      stepId: 'cli_execution_start',
      description: 'Starting CLI execution',
      phase: 'start',
      context: { taskId: options.taskId, poolName: this.getPoolForTask(options.priority, options.feature) }
    })

    const poolName = this.getPoolForTask(options.priority, options.feature)
    const slotPid = await this.poolManager.acquire(poolName)

    try {
      const maxAttempts = this.modelSelector.getTotalModelCount() * (this.retryConfig.retrySameModel ? this.retryConfig.maxRetriesPerModel : 1)

      const runner = createResilienceRunner({
        maxAttempts: maxAttempts,
        retryOnRateLimit: true,
        retryOnTransient: true,
        retryableErrors: ['opencode cache corruption'],
        rateLimitWaitMs: this.retryConfig.rateLimitWaitMs,
        exponentialBackoff: this.retryConfig.exponentialBackoff,
        exponentialBackoffBaseDelay: this.retryConfig.delayBetweenModelAttemptsMs || this.retryConfig.baseDelayMs,
        exponentialBackoffMaxDelay: this.retryConfig.maxDelayMs,
        exponentialBackoffMultiplier: this.retryConfig.backoffMultiplier,
      })

      let currentModelName: string | null = null

      const retryResult = await runner.execute(async () => {
        const modelConfig = this.modelSelector.getNext()
        if (!modelConfig) {
          throw new Error('No more CLI configurations available')
        }

        const modelName = modelConfig.displayName || modelConfig.name
        currentModelName = modelConfig.name
        const workerPrefix = options.workerId !== undefined ? `[Worker ${options.workerId}] ` : ''
        const displayName = `${workerPrefix}${modelConfig.cli === 'claude' ? modelName : `${modelConfig.cli}/${modelName}`}`
        const cliPath = this.cliPaths.get(modelConfig.cli)

        if (!cliPath) {
          // Track failure for circuit breaker
          this.modelSelector.recordFailure(modelConfig.name)
          throw new Error(`CLI tool ${modelConfig.cli} not found`)
        }

        await this.pluginRegistry.runHook('onStep', {
          stepId: 'model_selected',
          description: `Model selected: ${displayName}`,
          phase: 'start',
          context: { taskId: options.taskId, model: displayName, cli: modelConfig.cli }
        })

        const effectiveTimeout = modelConfig.timeout ?? timeoutSecs
        const baseEnv = { ...process.env, ...modelConfig.env } as Record<string, string>

        const strategy = this.strategyRegistry.get(modelConfig.cli)
        const prepared = strategy.prepare({
          modelConfig,
          prompt: finalPrompt,
          env: baseEnv,
          permissions: options.permissions,
        })

        await this.pluginRegistry.runHook('onToolCall', {
          toolName: modelConfig.cli,
          arguments: {
            model: modelConfig.model,
            cli: modelConfig.cli,
            timeout: effectiveTimeout,
            hasInput: modelConfig.cli === 'claude',
          },
          taskId: options.taskId,
          timestamp: Date.now(),
          metadata: { displayName }
        })

        const startTime = Date.now()
        await this.pluginRegistry.runHook('onStep', {
          stepId: 'cli_spawn_start',
          description: `Spawning CLI: ${displayName}`,
          phase: 'start',
          context: { taskId: options.taskId, model: displayName }
        })

        const result = await this.spawnWithTimeout(
          cliPath,
          prepared.args,
          {
            env: prepared.env,
            input: prepared.stdinInput,
            prefix: displayName,
            taskId: options.taskId,
            workerId: options.workerId,
            poolName,
          },
          outputFile,
          effectiveTimeout
        )
        const spawnDuration = Date.now() - startTime

        await this.pluginRegistry.runHook('onStep', {
          stepId: 'cli_spawn_end',
          description: `CLI spawn completed: ${displayName}`,
          phase: 'end',
          context: { taskId: options.taskId, exitCode: result.exitCode, durationMs: spawnDuration }
        })

        let fullOutput = ''
        try {
          if (fs.existsSync(outputFile)) {
            fullOutput = fs.readFileSync(outputFile, 'utf-8')
          }
        } catch {}

        await this.pluginRegistry.runHook('onCliResult', {
          taskId: options.taskId,
          model: displayName,
          cli: modelConfig.cli,
          exitCode: result.exitCode,
          durationMs: spawnDuration,
          output: fullOutput,
          timedOut: result.timedOut,
        })

        if (result.resourceExhausted) {
          throw new Error(result.resourceExhausted)
        }

        if (result.timedOut) {
          throw new Error(`Execution timed out after ${effectiveTimeout}s`)
        }

        const output = fullOutput.slice(-2000)
        if (isRateLimitOutput(output)) {
          throw new RateLimitError(`Rate limit exceeded on ${displayName}`)
        }

        if (/quota.*exceed|billing.*limit/i.test(output)) {
          this.switchToFallback()
          throw new Error(`Quota exceeded on ${displayName}`)
        }

        if (strategy.detectCacheCorruption?.(fullOutput)) {
          const cleared = strategy.clearCache?.() ?? false
          if (cleared) {
            throw new OpenCodeCacheError(`${modelConfig.cli} cache corruption detected and cleared, retrying...`)
          } else {
            throw new Error(`${modelConfig.cli} cache corruption detected but failed to clear cache`)
          }
        }

        if (result.exitCode !== 0) {
          // Track failure for circuit breaker
          if (currentModelName) {
            const justOpened = this.modelSelector.recordFailure(currentModelName)
            if (justOpened) {
              this.logger.error(
                `[CircuitBreaker] Model ${currentModelName} disabled after ${this.modelSelector.getCircuitBreakerState(currentModelName)?.failures} failures`
              )
            }
          }
          throw new Error(`CLI exited with code ${result.exitCode}`)
        }

        // Track success for circuit breaker
        if (currentModelName) {
          this.modelSelector.recordSuccess(currentModelName)
        }

        return 0
      })

      if (retryResult.success) {
        return 0
      }

      throw new Error('All CLI configurations failed after exhausting all models')
    } finally {
      await this.pluginRegistry.runHook('onStep', {
        stepId: 'cli_execution_end',
        description: 'CLI execution completed',
        phase: 'end',
        context: { taskId: options.taskId, poolName }
      })
      await this.poolManager.release(slotPid)
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
      const availableMemoryMB = getAvailableMemoryMB()
      if (availableMemoryMB < MIN_FREE_MEMORY_MB) {
        return reject(new Error(`Insufficient memory: ${availableMemoryMB}MB available`))
      }

      const writeStream = fs.createWriteStream(outputFile)
      let timedOut = false
      const streamLogger = new StreamLogger(this.logger, options.prefix)

      this.logger.startSpinner(`${options.prefix || 'CLI'} starting...`)

      const poolConfig = this.poolManager.getPoolConfig(options.poolName || 'medium')
      const child = this.processManager.spawn(command, args, {
        env: options.env as Record<string, string>,
        nice: poolConfig.nice,
      })

      this.currentProcess = child

      child.stdout?.on('data', (data) => {
        writeStream.write(data)
        streamLogger.log(data)
        this.pluginRegistry.runHook('onAgentResponse', {
          responseText: data.toString('utf-8'),
          model: options.prefix,
          taskId: options.taskId,
          timestamp: Date.now(),
          isPartial: true,
        }).catch(() => {})
      })

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          writeStream.write(data)
          streamLogger.log(data)
        })
      }

      if (child.stdin) {
        if (options.input) child.stdin.write(options.input)
        child.stdin.end()
      }

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), DEFAULT_SIGKILL_DELAY_MS)
      }, timeoutSecs * 1000)

      child.on('close', (code) => {
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentProcess = null

        this.pluginRegistry.runHook('onAgentResponse', {
          responseText: '',
          model: options.prefix,
          taskId: options.taskId,
          timestamp: Date.now(),
          isPartial: false,
        }).catch(() => {})

        resolve({
          exitCode: code ?? 1,
          timedOut
        })
      })

      child.on('error', () => {
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentProcess = null
        resolve({ exitCode: 1, timedOut: false })
      })
    })
  }
}
