import { spawnSync, execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import chalk from 'chalk'
import { StreamLogger } from '@loopwork-ai/common'
import { 
  isRateLimitOutput, 
  createResilienceRunner, 
  RateLimitError,
  isRateLimitError 
} from '@loopwork-ai/resilience'
import type { 
  ILogger, 
  IProcessManager, 
  ISpawnedProcess, 
  ISpawner,
  IPluginRegistry,
  ICapabilityRegistry,
  ModelConfig,
  CliExecutorConfig,
  RetryConfig,
  CliType,
  ExecutionOptions,
  ITaskMinimal
} from '@loopwork-ai/contracts'
import { ModelSelector } from './model-selector'
import { WorkerPoolManager, type WorkerPoolConfig } from './isolation/worker-pool-manager'
import { createSpawner } from './spawners'

const MIN_FREE_MEMORY_MB = 512
const DEFAULT_SIGKILL_DELAY_MS = 5000
const DEFAULT_PROGRESS_INTERVAL_MS = 2000

/**
 * OpenCode cache corruption error patterns
 * These patterns indicate the OpenCode cache is corrupted and needs to be cleared
 */
const OPENCODE_CACHE_CORRUPTION_PATTERNS = [
  /ENOENT.*reading.*\.cache\/opencode/i,
  /ENOENT.*\.cache\/opencode\/node_modules/i,
  /BuildMessage:.*ENOENT.*opencode/i,
]

/**
 * Check if output indicates OpenCode cache corruption
 */
function isOpenCodeCacheCorruption(output: string): boolean {
  return OPENCODE_CACHE_CORRUPTION_PATTERNS.some(pattern => pattern.test(output))
}

/**
 * Clear OpenCode cache directory
 * Returns true if cache was cleared successfully
 */
function clearOpenCodeCache(logger?: ILogger): boolean {
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
      ...config.retry,
    }

    const preferPty = config.preferPty ?? true
    this.spawner = createSpawner(preferPty)
    
    this.detectClis()

    const primaryModels = config.models ?? EXEC_MODELS
    const fallbackModels = config.fallbackModels ?? FALLBACK_MODELS
    const strategy = config.selectionStrategy ?? 'round-robin'

    this.modelSelector = new ModelSelector(primaryModels, fallbackModels, strategy)

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
        maxAttempts: maxAttempts + 1,
        retryOnRateLimit: true,
        retryOnTransient: true,
        retryableErrors: ['opencode cache corruption'],
        rateLimitWaitMs: this.retryConfig.rateLimitWaitMs,
        exponentialBackoff: this.retryConfig.exponentialBackoff,
        exponentialBackoffBaseDelay: this.retryConfig.baseDelayMs,
        exponentialBackoffMaxDelay: this.retryConfig.maxDelayMs,
        exponentialBackoffMultiplier: this.retryConfig.backoffMultiplier,
      })

      const retryResult = await runner.execute(async () => {
        const modelConfig = this.modelSelector.getNext()
        if (!modelConfig) {
          throw new Error('No more CLI configurations available')
        }

        const modelName = modelConfig.displayName || modelConfig.name
        const displayName = modelConfig.cli === 'claude' ? modelName : `${modelConfig.cli}/${modelName}`
        const cliPath = this.cliPaths.get(modelConfig.cli)

        if (!cliPath) {
          throw new Error(`CLI tool ${modelConfig.cli} not found`)
        }

        await this.pluginRegistry.runHook('onStep', {
          stepId: 'model_selected',
          description: `Model selected: ${displayName}`,
          phase: 'start',
          context: { taskId: options.taskId, model: displayName, cli: modelConfig.cli }
        })

        const effectiveTimeout = modelConfig.timeout ?? timeoutSecs
        const env = { ...process.env, ...modelConfig.env, ...options.permissions }
        let args: string[] = []

        if (modelConfig.cli === 'opencode') {
          if (!env['OPENCODE_PERMISSION']) {
            env['OPENCODE_PERMISSION'] = '{"*":"allow"}'
          }
          args = ['run', '--model', modelConfig.model, finalPrompt]
        }

        if (modelConfig.args && modelConfig.args.length > 0) {
          args.push(...modelConfig.args)
        }

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
          args,
          {
            env,
            input: modelConfig.cli === 'claude' ? finalPrompt : undefined,
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

        if (modelConfig.cli === 'opencode' && isOpenCodeCacheCorruption(fullOutput)) {
          const cleared = clearOpenCodeCache(this.logger)
          if (cleared) {
            throw new OpenCodeCacheError(`OpenCode cache corruption detected and cleared, retrying...`)
          } else {
            throw new Error(`OpenCode cache corruption detected but failed to clear cache`)
          }
        }

        if (result.exitCode !== 0) {
          throw new Error(`CLI exited with code ${result.exitCode}`)
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

      child.on('error', (err) => {
        clearTimeout(timer)
        streamLogger.flush()
        writeStream.end()
        this.currentProcess = null
        resolve({ exitCode: 1, timedOut: false })
      })
    })
  }
}
