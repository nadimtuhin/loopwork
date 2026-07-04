import { CliExecutor as BaseCliExecutor, createSpawner } from '@loopwork-ai/executor'
import type { Config } from './config'
import type { CliExecutorOptions as BaseOptions } from '@loopwork-ai/executor'
import type { ProcessSpawner } from '../contracts/spawner'
import type { IPluginRegistry, ILogger, IProcessManager, IIsolationProvider } from '@loopwork-ai/contracts'
import type { ProcessRegistry } from '@loopwork-ai/process-manager'
import type { ICliDetector } from '@loopwork-ai/contracts'
import { NodeBasedCliDetector } from '@loopwork-ai/cli-detector'
import type { CliType } from '@loopwork-ai/contracts'
import { LocalIsolationProvider } from '@loopwork-ai/isolation'

export interface CliExecutorOptions extends BaseOptions {
  spawner?: ProcessSpawner
  pluginRegistry: IPluginRegistry
  logger: ILogger
  processManager: IProcessManager
  processRegistry?: {
    add(pid: number, metadata: Record<string, unknown>): Promise<void>
    remove(pid: number): Promise<void>
  }
  /** Optional CLI detector - if not provided, uses NodeBasedCliDetector by default */
  cliDetector?: ICliDetector
  /** Optional isolation provider - if not provided, uses LocalIsolationProvider by default */
  isolationProvider?: IIsolationProvider
}

export class CliExecutor extends BaseCliExecutor {
  private currentConfig: Config
  private currentOptions: CliExecutorOptions
  private cliDetector: ICliDetector
  private detectionPromise: Promise<void> | null = null

  constructor(config: Config, options: CliExecutorOptions) {
    const cliConfig = config.cliConfig || {}

    const pluginRegistry = options.pluginRegistry
    const executorLogger = options.logger
    const processManager = options.processManager

    // Store detector and config before super() to avoid "must call super first" error
    const cliDetector = options.cliDetector ?? new NodeBasedCliDetector()

    // Default to LocalIsolationProvider if not provided
    const isolationProvider = options.isolationProvider ?? new LocalIsolationProvider()

    super(cliConfig, processManager, pluginRegistry, executorLogger, {
      ...options,
      isolationProvider
    })

    // Initialize instance properties after super() call
    this.cliDetector = cliDetector
    this.currentConfig = config
    this.currentOptions = options

    // Initialize CLI paths asynchronously (fire and forget)
    this.detectionPromise = this.initializeCliPaths().catch((error) => {
      executorLogger.warn(`CLI detection failed: ${error.message}`)
    })
  }

  /**
   * Initialize CLI paths using the injected detector.
   * This replaces the hardcoded detection logic in BaseCliExecutor.
   * Called asynchronously after construction.
   */
  private async initializeCliPaths(): Promise<void> {
    // Use type assertion to access private cliPaths Map from BaseCliExecutor
    const self = this as unknown as { cliPaths: Map<string, string> }
    const cliPaths = self.cliPaths

    // Detect all CLIs using the detector
    const detectionResult = await this.cliDetector.detectAll()

    if (!detectionResult.hasAny) {
      throw new Error('No AI CLI tools found. Please install Claude, OpenCode, or Gemini CLI.')
    }

    // Populate cliPaths Map from detection results
    for (const [type, binaryInfo] of detectionResult.found) {
      cliPaths.set(type, binaryInfo.path)
    }

    // Also check for additional CLIs that might be configured but not detected
    // This ensures backward compatibility with config.cliPaths
    const configPaths = this.currentConfig.cliConfig?.cliPaths
    if (configPaths) {
      for (const [cli, path] of Object.entries(configPaths)) {
        if (path && !cliPaths.has(cli)) {
          cliPaths.set(cli, path)
        }
      }
    }
  }

  /**
   * Ensure CLI paths are detected before first use.
   * Waits for detection to complete if still in progress.
   */
  private async ensureCliPathsDetected(): Promise<void> {
    if (this.detectionPromise) {
      await this.detectionPromise
      this.detectionPromise = null // Clear after first use
    }
  }

  /**
   * Get a CLI path, ensuring detection has been performed first.
   */
  async getCliPath(type: CliType): Promise<string | null> {
    await this.ensureCliPathsDetected()
    const self = this as unknown as { cliPaths: Map<string, string> }
    return self.cliPaths.get(type) ?? null
  }

  getProcessManager(): unknown {
    return (this as unknown as { processManager?: unknown }).processManager
  }

  resetFallback(): void {
    const self = this as unknown as { modelSelector?: { reset(): void } }
    if (self.modelSelector) {
      self.modelSelector.reset()
    }
  }

  updateConfig(newConfig: Config): void {
    const newCliConfig = newConfig.cliConfig || {}
    const oldCliConfig = this.currentConfig.cliConfig || {}
    
    const configChanged = JSON.stringify(newCliConfig) !== JSON.stringify(oldCliConfig)
    const timeoutChanged = newConfig.timeout !== this.currentConfig.timeout
    const resourceLimitsChanged = JSON.stringify(newConfig.resourceLimits) !== JSON.stringify(this.currentConfig.resourceLimits)
    
    if (configChanged) {
      const self = this as unknown as { cliConfig?: unknown }
      self.cliConfig = newCliConfig
    }
    
    if (timeoutChanged || resourceLimitsChanged || 
        (newCliConfig.preferPty !== oldCliConfig.preferPty) ||
        (newCliConfig.sigkillDelayMs !== oldCliConfig.sigkillDelayMs)) {
      const processManager = this.getProcessManager() as unknown as {
        updateSettings?: (settings: {
          staleTimeoutMs?: number
          gracePeriodMs?: number
          resourceLimits?: unknown
        }) => void
      }
      
      if (processManager?.updateSettings) {
        processManager.updateSettings({
          staleTimeoutMs: (newConfig.timeout ?? 600) * 1000 * 2,
          gracePeriodMs: newCliConfig.sigkillDelayMs || 5000,
          resourceLimits: newConfig.resourceLimits,
        })
      }
    }
    
    this.currentConfig = newConfig
  }
}

export { EXEC_MODELS, FALLBACK_MODELS } from '@loopwork-ai/executor'
