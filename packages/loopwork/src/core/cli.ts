import { CliExecutor as BaseCliExecutor, createSpawner } from '@loopwork-ai/executor'
import { createProcessManager } from './process-management/process-manager'
import { plugins } from '../plugins'
import { logger } from './utils'
import type { Config } from './config'
import type { CliExecutorOptions as BaseOptions } from '@loopwork-ai/executor'
import type { ProcessSpawner } from '../contracts/spawner'
import type { IProcessManager, IPluginRegistry, ILogger } from '@loopwork-ai/contracts'

export interface CliExecutorOptions extends BaseOptions {
  spawner?: ProcessSpawner
  processManager?: IProcessManager
  pluginRegistry?: IPluginRegistry
  logger?: ILogger
}

export class CliExecutor extends BaseCliExecutor {
  constructor(config: Config, options?: CliExecutorOptions) {
    const cliConfig = config.cliConfig || {}

    const pluginRegistry = options?.pluginRegistry || plugins
    const executorLogger = options?.logger || logger

    const processManager = options?.processManager || createProcessManager({
       spawner: (options?.spawner as any) || createSpawner(cliConfig.preferPty ?? true),
       staleTimeoutMs: (config.timeout ?? 600) * 1000 * 2,
       gracePeriodMs: cliConfig.sigkillDelayMs || 5000,
    })

    super(cliConfig, processManager, pluginRegistry, executorLogger, options)
  }

  getProcessManager(): IProcessManager {
    return (this as any).processManager
  }
}

export { EXEC_MODELS, FALLBACK_MODELS } from '@loopwork-ai/executor'
