import { CliExecutor as BaseCliExecutor, createSpawner } from '@loopwork-ai/executor'
import { createProcessManager } from './process-management/process-manager'
import type { Config } from './config'
import type { CliExecutorOptions as BaseOptions } from '@loopwork-ai/executor'
import type { ProcessSpawner } from '../contracts/spawner'
import type { IPluginRegistry, ILogger, IProcessManager } from '@loopwork-ai/contracts'

export interface CliExecutorOptions extends BaseOptions {
  spawner?: ProcessSpawner
  pluginRegistry: IPluginRegistry
  logger: ILogger
  processManager?: IProcessManager
}

export class CliExecutor extends BaseCliExecutor {
  constructor(config: Config, options: CliExecutorOptions) {
    const cliConfig = config.cliConfig || {}

    const pluginRegistry = options.pluginRegistry
    const executorLogger = options.logger

    const processManager = options.processManager || createProcessManager({
       spawner: options.spawner || createSpawner(cliConfig.preferPty ?? true),
       staleTimeoutMs: (config.timeout ?? 600) * 1000 * 2,
       gracePeriodMs: cliConfig.sigkillDelayMs || 5000,
       resourceLimits: config.resourceLimits,
    })

    super(cliConfig, processManager as unknown as import('@loopwork-ai/contracts').IProcessManager, pluginRegistry, executorLogger, options)
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
}

export { EXEC_MODELS, FALLBACK_MODELS } from '@loopwork-ai/executor'
