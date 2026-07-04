
import { describe, test, expect, mock, beforeEach } from 'bun:test'
import { CliExecutor } from '../src/core/cli'
import type { Config } from '../src/core/config'
import type { CliExecutorOptions } from '../src/core/cli'
import type { IPluginRegistry, ILogger, IProcessManager } from '@loopwork-ai/contracts'

describe('CliExecutor.updateConfig', () => {
  let mockPluginRegistry: IPluginRegistry
  let mockLogger: ILogger
  let mockProcessManager: IProcessManager & { updateSettings: ReturnType<typeof mock> }
  let executor: CliExecutor
  let initialConfig: Config

  beforeEach(() => {
    mockPluginRegistry = {
      onLoopStart: mock(),
      onLoopEnd: mock(),
      onTaskStart: mock(),
      onTaskComplete: mock(),
      onTaskFailed: mock(),
      onConfigLoad: mock(),
      onBackendReady: mock(),
    } as unknown as IPluginRegistry

    mockLogger = {
      info: mock(),
      warn: mock(),
      error: mock(),
      debug: mock(),
      update: mock(),
    } as unknown as ILogger

    mockProcessManager = {
      start: mock(),
      stop: mock(),
      restart: mock(),
      cleanup: mock(),
      getProcess: mock(),
      updateSettings: mock(),
    } as unknown as IProcessManager & { updateSettings: ReturnType<typeof mock> }

    initialConfig = {
      cli: 'claude',
      timeout: 300,
      cliConfig: {
        preferPty: true,
        sigkillDelayMs: 5000,
      },
      // minimal valid config
      backend: { type: 'json', tasksFile: 'tasks.json' },
      maxIterations: 10,
      projectRoot: '/tmp',
      outputDir: '/tmp/output',
      sessionId: 'session-1',
      debug: false,
      resume: false,
      namespace: 'default',
      parallel: 1,
      parallelFailureMode: 'continue',
      logLevel: 'info'
    } as Config

    const options: CliExecutorOptions = {
      pluginRegistry: mockPluginRegistry,
      logger: mockLogger,
      processManager: mockProcessManager,
    }

    executor = new CliExecutor(initialConfig, options)
  })

  test('updates timeout settings in process manager', () => {
    const newConfig = {
      ...initialConfig,
      timeout: 600
    }

    executor.updateConfig(newConfig)

    expect(mockProcessManager.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      staleTimeoutMs: 600 * 1000 * 2
    }))
  })

  test('updates sigkillDelayMs settings in process manager', () => {
    const newConfig = {
      ...initialConfig,
      cliConfig: {
        ...initialConfig.cliConfig,
        sigkillDelayMs: 10000
      }
    }

    executor.updateConfig(newConfig)

    expect(mockProcessManager.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      gracePeriodMs: 10000
    }))
  })

  test('updates internal currentConfig', () => {
    const newConfig = {
      ...initialConfig,
      timeout: 900
    }

    executor.updateConfig(newConfig)

    // Verify by checking behavior or private property if possible
    // Here we check if calling updateConfig again with DIFFERENT value triggers update
    // If state wasn't updated, this second call might behave differently if logic depends on diff
    
    mockProcessManager.updateSettings.mockClear()
    
    const newerConfig = {
      ...newConfig,
      timeout: 1200
    }
    
    executor.updateConfig(newerConfig)
    
    expect(mockProcessManager.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      staleTimeoutMs: 1200 * 1000 * 2
    }))
  })

  test('does not call updateSettings if relevant config has not changed', () => {
    const newConfig = {
      ...initialConfig,
      // Change something irrelevant to process manager
      maxIterations: 20
    }

    executor.updateConfig(newConfig)

    expect(mockProcessManager.updateSettings).not.toHaveBeenCalled()
  })
})
