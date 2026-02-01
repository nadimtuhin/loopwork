import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'
import { CliExecutor, EXEC_MODELS, FALLBACK_MODELS } from '../src/cli-executor'
import { ModelSelector, calculateBackoffDelay } from '../src/model-selector'
import { WorkerPoolManager } from '../src/isolation/worker-pool-manager'
import { createSpawner } from '../src/spawners'
import type { IProcessManager, IPluginRegistry, ILogger, ISpawnedProcess, ModelConfig } from '@loopwork-ai/contracts'
import { EventEmitter } from 'events'
import { Readable, Writable } from 'stream'
import fs from 'fs'

class MockProcess extends EventEmitter implements ISpawnedProcess {
  pid = 123
  stdout = new Readable({ read() {} })
  stderr = new Readable({ read() {} })
  stdin = new Writable({ write() {} })
  kill = mock(() => true)
}

describe('CliExecutor', () => {
  let mockProcessManager: IProcessManager
  let mockPluginRegistry: IPluginRegistry
  let mockLogger: ILogger
  let tempDir: string

  beforeEach(() => {
    mockProcessManager = {
      spawn: mock(() => new MockProcess()),
      kill: mock(() => true),
      track: mock(() => {}),
      untrack: mock(() => {}),
      listChildren: mock(() => []),
      listByNamespace: mock(() => []),
      cleanup: mock(async () => ({ cleaned: [], failed: [], alreadyGone: [] })),
      persist: mock(async () => {}),
      load: mock(async () => {})
    } as unknown as IProcessManager

    mockPluginRegistry = {
      runHook: mock(async () => {}),
      getCapabilityRegistry: mock(() => ({
        getPromptInjection: mock(() => ''),
        getCommands: mock(() => []),
        getSkills: mock(() => []),
        register: mock(() => {}),
        getPluginCapabilities: mock(() => undefined)
      }))
    } as unknown as IPluginRegistry

    mockLogger = {
      trace: mock(() => {}),
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      success: mock(() => {}),
      update: mock(() => {}),
      startSpinner: mock(() => {}),
      stopSpinner: mock(() => {}),
      raw: mock(() => {}),
      setLogLevel: mock(() => {})
    }

    tempDir = fs.mkdtempSync('/tmp/executor-test-')
  })

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('should execute a task successfully', async () => {
    const executor = new CliExecutor(
      { cliPaths: { opencode: '/usr/bin/opencode' } } as any,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    mockProcessManager.spawn = mock(() => {
      const proc = new MockProcess()
      setTimeout(() => proc.emit('close', 0), 10)
      return proc
    })

    const task = { id: 'TASK-001', title: 'Test Task' }
    const exitCode = await executor.executeTask(task, 'Test prompt', `${tempDir}/test.log`, 60)

    expect(exitCode).toBe(0)
    expect(mockProcessManager.spawn).toHaveBeenCalled()
    expect(mockPluginRegistry.runHook).toHaveBeenCalled()
  })

  test('should handle model pool exhaustion (all models fail)', async () => {
    const executor = new CliExecutor(
      { cliPaths: { opencode: '/usr/bin/opencode', claude: '/usr/bin/claude' } } as any,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    mockProcessManager.spawn = mock(() => {
      const proc = new MockProcess()
      setTimeout(() => proc.emit('close', 1), 5)
      return proc
    })

    const task = { id: 'TASK-003', title: 'Test Task' }

    await expect(
      executor.executeTask(task, 'Test prompt', `${tempDir}/test.log`, 60)
    ).rejects.toThrow('All CLI configurations failed after exhausting all models')
  })

  test('should handle rate limit with backoff', async () => {
    let spawnCount = 0
    const executor = new CliExecutor(
      { 
        cliPaths: { opencode: '/usr/bin/opencode' },
        retry: { 
          rateLimitWaitMs: 100,
          exponentialBackoff: true,
          baseDelayMs: 10,
          maxDelayMs: 50
        }
      } as any,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    mockProcessManager.spawn = mock(() => {
      spawnCount++
      const proc = new MockProcess()
      setTimeout(() => proc.emit('close', 0), 5)
      return proc
    })

    const task = { id: 'TASK-004', title: 'Test Task' }
    
    const originalWriteFileSync = fs.writeFileSync
    fs.writeFileSync = mock((path: any, data: any) => {
      if (typeof data === 'string' && (String(path).includes('output') || String(path).includes('test.log'))) {
        originalWriteFileSync(path, 'rate limit exceeded - please retry after 429')
      } else {
        originalWriteFileSync(path, data)
      }
    })

    const startTime = Date.now()
    const exitCode = await executor.executeTask(task, 'Test prompt', `${tempDir}/test.log`, 60)
    const elapsed = Date.now() - startTime

    fs.writeFileSync = originalWriteFileSync

    expect(elapsed).toBeGreaterThanOrEqual(10)
    expect(exitCode).toBe(0)
  })

  test('should detect available CLIs', () => {
    const executor = new CliExecutor(
      { 
        cliPaths: { opencode: '/usr/bin/opencode', claude: '/usr/bin/claude' } 
      } as any,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    const cliPaths = (executor as any).cliPaths
    expect(cliPaths.size).toBeGreaterThan(0)
  })

  test('should cleanup resources on cleanup()', async () => {
    const executor = new CliExecutor(
      { cliPaths: { opencode: '/usr/bin/opencode' } } as any,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    mockProcessManager.spawn = mock(() => {
      const proc = new MockProcess()
      setTimeout(() => proc.emit('close', 0), 100)
      return proc
    })

    await executor.cleanup()

    expect(mockProcessManager.cleanup).toHaveBeenCalled()
  })
})

describe('ModelSelector', () => {
  test('should select models in round-robin order', () => {
    const models: ModelConfig[] = [
      { name: 'model1', cli: 'opencode', model: 'm1' },
      { name: 'model2', cli: 'opencode', model: 'm2' },
      { name: 'model3', cli: 'opencode', model: 'm3' },
    ]
    
    const selector = new ModelSelector(models, [], 'round-robin')
    
    expect(selector.getNext()?.name).toBe('model1')
    expect(selector.getNext()?.name).toBe('model2')
    expect(selector.getNext()?.name).toBe('model3')
    expect(selector.getNext()?.name).toBe('model1')
  })

  test('should select from fallback pool when switched', () => {
    const primary: ModelConfig[] = [
      { name: 'primary1', cli: 'opencode', model: 'p1' },
    ]
    const fallback: ModelConfig[] = [
      { name: 'fallback1', cli: 'claude', model: 'f1' },
      { name: 'fallback2', cli: 'claude', model: 'f2' },
    ]
    
    const selector = new ModelSelector(primary, fallback, 'round-robin')
    
    expect(selector.getNext()?.name).toBe('primary1')
    expect(selector.isUsingFallback()).toBe(false)
    
    selector.switchToFallback()
    expect(selector.isUsingFallback()).toBe(true)
    
    expect(selector.getNext()?.name).toBe('fallback1')
    expect(selector.getNext()?.name).toBe('fallback2')
    expect(selector.getNext()?.name).toBe('fallback1')
  })

  test('should select priority model', () => {
    const models: ModelConfig[] = [
      { name: 'low-priority', cli: 'opencode', model: 'l' },
      { name: 'high-priority', cli: 'opencode', model: 'h' },
      { name: 'medium-priority', cli: 'opencode', model: 'm' },
    ]
    
    const selector = new ModelSelector(models, [], 'priority')
    
    expect(selector.getNext()?.name).toBe('low-priority')
    expect(selector.getNext()?.name).toBe('low-priority')
  })

  test('should select cost-aware model', () => {
    const models: ModelConfig[] = [
      { name: 'expensive', cli: 'opencode', model: 'e', costWeight: 100 },
      { name: 'cheap', cli: 'opencode', model: 'c', costWeight: 10 },
      { name: 'medium', cli: 'opencode', model: 'm', costWeight: 50 },
    ]
    
    const selector = new ModelSelector(models, [], 'cost-aware')
    
    expect(selector.getNext()?.name).toBe('cheap')
    expect(selector.getNext()?.name).toBe('cheap')
  })

  test('should track retry counts', () => {
    const models: ModelConfig[] = [
      { name: 'model1', cli: 'opencode', model: 'm1' },
    ]
    
    const selector = new ModelSelector(models, [], 'round-robin')
    
    expect(selector.trackRetry('model1')).toBe(1)
    expect(selector.trackRetry('model1')).toBe(2)
    expect(selector.trackRetry('model1')).toBe(3)
    
    expect(selector.getRetryCount('model1')).toBe(3)
    
    selector.resetRetryCount()
    expect(selector.getRetryCount('model1')).toBe(0)
  })

  test('should reset all state', () => {
    const models: ModelConfig[] = [
      { name: 'model1', cli: 'opencode', model: 'm1' },
    ]
    const fallback: ModelConfig[] = [
      { name: 'fallback1', cli: 'claude', model: 'f1' },
    ]
    
    const selector = new ModelSelector(models, fallback, 'round-robin')
    
    selector.getNext()
    selector.getNext()
    selector.switchToFallback()
    selector.trackRetry('model1')
    
    selector.reset()
    
    expect(selector.isUsingFallback()).toBe(false)
    expect(selector.getRetryCount('model1')).toBe(0)
    expect(selector.getNext()?.name).toBe('model1')
  })

  test('should filter disabled models', () => {
    const models: ModelConfig[] = [
      { name: 'enabled1', cli: 'opencode', model: 'e1', enabled: true },
      { name: 'disabled', cli: 'opencode', model: 'd', enabled: false },
      { name: 'enabled2', cli: 'opencode', model: 'e2' },
    ]
    
    const selector = new ModelSelector(models, [], 'round-robin')
    
    const selected: string[] = []
    for (let i = 0; i < 5; i++) {
      const next = selector.getNext()
      if (next) selected.push(next.name)
    }
    
    expect(selected).not.toContain('disabled')
    expect(selected).toContain('enabled1')
    expect(selected).toContain('enabled2')
  })
})

describe('calculateBackoffDelay', () => {
  test('should calculate exponential backoff', () => {
    expect(calculateBackoffDelay(0, 1000, 60000)).toBe(1000)
    expect(calculateBackoffDelay(1, 1000, 60000)).toBe(2000)
    expect(calculateBackoffDelay(2, 1000, 60000)).toBe(4000)
    expect(calculateBackoffDelay(3, 1000, 60000)).toBe(8000)
    expect(calculateBackoffDelay(4, 1000, 60000)).toBe(16000)
  })

  test('should cap at max delay', () => {
    expect(calculateBackoffDelay(10, 1000, 60000)).toBe(60000)
    expect(calculateBackoffDelay(100, 1000, 60000)).toBe(60000)
  })

  test('should use default values', () => {
    expect(calculateBackoffDelay(0)).toBe(1000)
    expect(calculateBackoffDelay(0, 500)).toBe(500)
    expect(calculateBackoffDelay(10, 1000, 30000)).toBe(30000)
  })
})

describe('WorkerPoolManager', () => {
  test('should acquire and release slots', async () => {
    const manager = new WorkerPoolManager({
      pools: {
        'test': { size: 2, nice: 0, memoryLimitMB: 1024 }
      },
      defaultPool: 'test'
    })

    const pid1 = await manager.acquire('test')
    const pid2 = await manager.acquire('test')

    expect(pid1).not.toBe(pid2)

    await manager.release(pid1)
    await manager.release(pid2)

    const stats = manager.getStats()
    expect(stats['test'].active).toBe(0)
  })

  test('should reject when pool at capacity', async () => {
    const manager = new WorkerPoolManager({
      pools: {
        'limited': { size: 1, nice: 0, memoryLimitMB: 512 }
      },
      defaultPool: 'limited'
    })

    const pid1 = await manager.acquire('limited')
    
    await expect(manager.acquire('limited')).rejects.toThrow('at capacity')

    await manager.release(pid1)
  })

  test('should track processes', () => {
    const manager = new WorkerPoolManager({
      pools: {
        'test': { size: 5, nice: 0, memoryLimitMB: 1024 }
      },
      defaultPool: 'test'
    })

    manager.trackProcess(12345, 'test', 'TASK-001', 1)
    manager.trackProcess(12346, 'test', 'TASK-002')

    const stats = manager.getStats()
    expect(stats['test'].active).toBe(2)
  })

  test('should get pool config', () => {
    const manager = new WorkerPoolManager({
      pools: {
        'test': { size: 5, nice: 10, memoryLimitMB: 2048 }
      },
      defaultPool: 'test'
    })

    const config = manager.getPoolConfig('test')
    expect(config.size).toBe(5)
    expect(config.nice).toBe(10)
    expect(config.memoryLimitMB).toBe(2048)
  })

  test('should shutdown and clear all processes', async () => {
    const manager = new WorkerPoolManager({
      pools: {
        'test': { size: 5, nice: 0, memoryLimitMB: 1024 }
      },
      defaultPool: 'test'
    })

    await manager.acquire('test')
    await manager.acquire('test')

    await manager.shutdown()

    const stats = manager.getStats()
    expect(stats['test'].active).toBe(0)
  })
})

describe('Spawners', () => {
  test('createSpawner should return a spawner', () => {
    const spawner = createSpawner(false)
    expect(spawner).toBeDefined()
    expect(spawner.spawn).toBeDefined()
  })

  test('createSpawner should prefer PTY when available and functional', () => {
    const spawner = createSpawner(true)
    expect(spawner).toBeDefined()
  })
})

describe('EXEC_MODELS and FALLBACK_MODELS', () => {
  test('EXEC_MODELS should have required fields', () => {
    for (const model of EXEC_MODELS) {
      expect(model.name).toBeDefined()
      expect(model.cli).toBeDefined()
      expect(model.model).toBeDefined()
      expect(model.displayName).toBeDefined()
    }
  })

  test('FALLBACK_MODELS should have required fields', () => {
    for (const model of FALLBACK_MODELS) {
      expect(model.name).toBeDefined()
      expect(model.cli).toBeDefined()
      expect(model.model).toBeDefined()
      expect(model.displayName).toBeDefined()
    }
  })

  test('EXEC_MODELS should contain expected models', () => {
    const names = EXEC_MODELS.map(m => m.name)
    expect(names).toContain('sonnet-claude')
    expect(names).toContain('sonnet-opencode')
    expect(names).toContain('gemini-3-flash')
  })

  test('FALLBACK_MODELS should contain expected models', () => {
    const names = FALLBACK_MODELS.map(m => m.name)
    expect(names).toContain('opus-claude')
    expect(names).toContain('gemini-3-pro')
  })
})
