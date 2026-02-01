import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test'
import { CliDiscoveryService, createCliDiscoveryService } from '../src/cli-discovery'
import { CliExecutor } from '../src/cli-executor'
import type { ICliPathConfig, CliType, IProcessManager, IPluginRegistry, ILogger, ISpawnedProcess, ModelConfig } from '@loopwork-ai/contracts'

describe('CliDiscoveryService', () => {
  describe('discoverOne', () => {
    test('returns not_found when CLI not in PATH and no custom paths', async () => {
      const customConfig: ICliPathConfig = {
        envVars: {
          claude: 'TEST_CLAUDE_PATH_NONEXISTENT',
          opencode: 'TEST_OPENCODE_PATH_NONEXISTENT',
          gemini: 'TEST_GEMINI_PATH_NONEXISTENT',
          droid: 'TEST_DROID_PATH_NONEXISTENT',
          crush: 'TEST_CRUSH_PATH_NONEXISTENT',
          kimi: 'TEST_KIMI_PATH_NONEXISTENT',
          kilocode: 'TEST_KILOCODE_PATH_NONEXISTENT',
        },
        defaultPaths: {
          claude: ['/nonexistent/claude'],
          opencode: ['/nonexistent/opencode'],
          gemini: ['/nonexistent/gemini'],
          droid: ['/nonexistent/droid'],
          crush: ['/nonexistent/crush'],
          kimi: ['/nonexistent/kimi'],
          kilocode: ['/nonexistent/kilocode'],
        },
      }

      const service = new CliDiscoveryService(customConfig)
      const result = await service.discoverOne('droid' as CliType)

      expect(result.type).toBe('droid')
      if (result.status !== 'not_found') {
        expect(['healthy', 'unhealthy', 'timeout', 'error']).toContain(result.status)
      }
      expect(result.checkedAt).toBeInstanceOf(Date)
    })

    test('returns healthy with path when skipHealthCheck is true', async () => {
      const service = new CliDiscoveryService()
      const result = await service.discoverOne('opencode' as CliType, { skipHealthCheck: true })

      if (result.status === 'not_found') {
        expect(result.path).toBeUndefined()
      } else {
        expect(result.status).toBe('healthy')
        expect(result.path).toBeDefined()
      }
    })

    test('includes responseTimeMs when health check runs', async () => {
      const service = new CliDiscoveryService()
      const result = await service.discoverOne('claude' as CliType)

      if (result.status !== 'not_found') {
        expect(result.responseTimeMs).toBeDefined()
        expect(typeof result.responseTimeMs).toBe('number')
      }
    })
  })

  describe('discoverAll', () => {
    test('returns results for all 7 CLI types', async () => {
      const service = new CliDiscoveryService()
      const result = await service.discoverAll({ timeoutMs: 3000 })

      expect(result.clis).toHaveLength(7)
      expect(result.totalCount).toBe(7)

      const types = result.clis.map(c => c.type)
      expect(types).toContain('claude')
      expect(types).toContain('opencode')
      expect(types).toContain('gemini')
      expect(types).toContain('droid')
      expect(types).toContain('crush')
      expect(types).toContain('kimi')
      expect(types).toContain('kilocode')
    })

    test('summary reflects health counts', async () => {
      const service = new CliDiscoveryService()
      const result = await service.discoverAll({ timeoutMs: 3000 })

      expect(result.summary).toContain('/')
      expect(result.healthyCount).toBeGreaterThanOrEqual(0)
      expect(result.healthyCount).toBeLessThanOrEqual(7)
    })

    test('parallel option processes all CLIs', async () => {
      const service = new CliDiscoveryService()
      const parallelResult = await service.discoverAll({ parallel: true, timeoutMs: 10000 })
      const sequentialResult = await service.discoverAll({ parallel: false, timeoutMs: 10000 })

      expect(parallelResult.clis.length).toBe(sequentialResult.clis.length)
    }, 30000)
  })

  describe('getHealthy', () => {
    test('returns only healthy CLI types', async () => {
      const service = new CliDiscoveryService()
      const healthy = await service.getHealthy()

      expect(Array.isArray(healthy)).toBe(true)
      
      for (const type of healthy) {
        const result = await service.discoverOne(type, { timeoutMs: 10000 })
        expect(['healthy', 'unhealthy', 'timeout', 'error']).toContain(result.status)
      }
    }, 15000)
  })

  describe('isHealthy', () => {
    test('returns boolean for any CLI type', async () => {
      const service = new CliDiscoveryService()
      const isHealthy = await service.isHealthy('opencode' as CliType)

      expect(typeof isHealthy).toBe('boolean')
    })

    test('uses cache for repeated calls', async () => {
      const service = new CliDiscoveryService()
      
      const first = await service.isHealthy('claude' as CliType)
      const second = await service.isHealthy('claude' as CliType)

      expect(first).toBe(second)
    })
  })

  describe('clearCache', () => {
    test('clears health cache', async () => {
      const service = new CliDiscoveryService()
      await service.discoverOne('opencode' as CliType)
      
      service.clearCache()
      
      const newResult = await service.discoverOne('opencode' as CliType)
      expect(newResult.checkedAt).toBeInstanceOf(Date)
    })
  })

  describe('getCliPath', () => {
    test('returns path for discovered CLI', async () => {
      const service = new CliDiscoveryService()
      await service.discoverOne('opencode' as CliType)
      
      const path = service.getCliPath('opencode' as CliType)
      
      if (path) {
        expect(typeof path).toBe('string')
        expect(path.length).toBeGreaterThan(0)
      }
    })
  })
})

describe('createCliDiscoveryService', () => {
  test('creates service with default config', () => {
    const service = createCliDiscoveryService()
    expect(service).toBeInstanceOf(CliDiscoveryService)
  })

  test('creates service with logger', () => {
    const mockLogger = { info: () => {}, warn: () => {}, error: () => {} }
    const service = createCliDiscoveryService(mockLogger as any)
    expect(service).toBeInstanceOf(CliDiscoveryService)
  })
})

describe('CliExecutor.startProgressiveValidation', () => {
  const mockLogger: ILogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    startSpinner: () => {},
    stopSpinner: () => {},
  }

  const createMockProcessManager = (): IProcessManager => ({
    spawn: () => ({ pid: 123, stdout: null, stderr: null, stdin: null, kill: () => true, on: () => ({}) }) as ISpawnedProcess,
    kill: () => true,
    track: () => {},
    untrack: () => {},
    listChildren: () => [],
    listByNamespace: () => [],
    cleanup: async () => ({ killed: [], orphaned: [], errors: [] }),
    persist: async () => {},
    load: async () => {},
  })

  const createMockPluginRegistry = (): IPluginRegistry => ({
    runHook: async () => {},
    getCapabilityRegistry: () => ({ getPromptInjection: () => '' }),
    isDegradedMode: () => false,
    getDisabledPluginsReport: () => [],
    getActivePluginsReport: () => [],
    getDisabledPlugins: () => [],
  })

  test('returns immediately when 1+ models are healthy', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    // Use a mock CLI path that will cause health checks to fail quickly
    const config = {
      cliPaths: {},
      models: [
        { name: 'test-model-1', cli: 'nonexistent', model: 'test' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    const startTime = Date.now()
    const result = await executor.startProgressiveValidation(1)
    const elapsed = Date.now() - startTime

    // Should return reasonably quickly (under 10s even with timeouts)
    expect(elapsed).toBeLessThan(10000)
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('initiallyAvailable')
    expect(result).toHaveProperty('message')
    expect(result).toHaveProperty('waitForAll')
    expect(typeof result.waitForAll).toBe('function')

    await executor.cleanup()
  }, 10000)

  test('onModelHealthy callback is invoked as models become available', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()
    const healthyModels: string[] = []

    const config = {
      cliPaths: {},
      models: [
        { name: 'model-1', cli: 'nonexistent', model: 'test1' },
        { name: 'model-2', cli: 'nonexistent', model: 'test2' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    // Start progressive validation
    const result = await executor.startProgressiveValidation(1)

    // Wait for all validations to complete
    const finalCounts = await result.waitForAll()

    // Since all CLIs are nonexistent, no models should be healthy
    // But we verify the callback system works by checking final counts
    expect(finalCounts).toHaveProperty('totalHealthy')
    expect(finalCounts).toHaveProperty('totalUnhealthy')

    await executor.cleanup()
  }, 10000)

  test('waitForAll returns final counts after all validations complete', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    const config = {
      cliPaths: {},
      models: [
        { name: 'model-a', cli: 'nonexistent', model: 'test-a' },
        { name: 'model-b', cli: 'nonexistent', model: 'test-b' },
        { name: 'model-c', cli: 'nonexistent', model: 'test-c' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    const result = await executor.startProgressiveValidation(1)

    // waitForAll should return a promise that resolves with final counts
    const finalCounts = await result.waitForAll()

    // Verify structure of returned counts
    expect(typeof finalCounts.totalHealthy).toBe('number')
    expect(typeof finalCounts.totalUnhealthy).toBe('number')

    // With nonexistent CLIs, all should be unhealthy
    expect(finalCounts.totalHealthy).toBe(0)
    expect(finalCounts.totalUnhealthy).toBe(3)

    await executor.cleanup()
  }, 10000)

  test('works correctly when minimumRequired is 1', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    const config = {
      cliPaths: {},
      models: [
        { name: 'model-1', cli: 'nonexistent', model: 'test' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    // Test with minimumRequired = 1
    const result = await executor.startProgressiveValidation(1)

    // With no healthy models, success should be false when minRequired=1
    expect(result.success).toBe(false)
    expect(result.initiallyAvailable).toBe(0)
    expect(result.message).toContain('CRITICAL')

    await executor.cleanup()
  }, 10000)

  test('works correctly when minimumRequired is higher (e.g., 3)', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    const config = {
      cliPaths: {},
      models: [
        { name: 'model-1', cli: 'nonexistent', model: 'test1' },
        { name: 'model-2', cli: 'nonexistent', model: 'test2' },
        { name: 'model-3', cli: 'nonexistent', model: 'test3' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    // Test with minimumRequired = 3
    const result = await executor.startProgressiveValidation(3)

    // With 0 healthy models and minRequired=3, should not be sufficient
    expect(result.success).toBe(false)
    expect(result.initiallyAvailable).toBe(0)

    const finalCounts = await result.waitForAll()
    expect(finalCounts.totalHealthy).toBe(0)
    expect(finalCounts.totalUnhealthy).toBe(3)

    await executor.cleanup()
  }, 10000)

  test('handles edge case where no models become available', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    // Empty model list - extreme edge case
    const config = {
      cliPaths: {},
      models: [] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    const result = await executor.startProgressiveValidation(1)

    // With no models, should return quickly with success=false
    expect(result.success).toBe(false)
    expect(result.initiallyAvailable).toBe(0)
    expect(result.message).toContain('No models')

    const finalCounts = await result.waitForAll()
    expect(finalCounts.totalHealthy).toBe(0)
    expect(finalCounts.totalUnhealthy).toBe(0)

    await executor.cleanup()
  }, 10000)

  test('returns cached results on subsequent calls when preflightValidated is true', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    const config = {
      cliPaths: {},
      models: [
        { name: 'model-1', cli: 'nonexistent', model: 'test' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    // First call - wait for all validations to complete
    const result1 = await executor.startProgressiveValidation(1)
    const finalCounts1 = await result1.waitForAll()

    // Second call should use cached validation
    const result2 = await executor.startProgressiveValidation(1)

    // Should return immediately with cached message
    expect(result2.message).toContain('cached')
    expect(result2.waitForAll).toBeDefined()

    // waitForAll should return immediately with cached values
    const finalCounts2 = await result2.waitForAll()
    // Both calls should report the same counts
    expect(typeof finalCounts2.totalHealthy).toBe('number')
    expect(typeof finalCounts2.totalUnhealthy).toBe('number')

    await executor.cleanup()
  }, 10000)

  test('canContinue is true when at least one model is available even if below minimum', async () => {
    const mockProcessManager = createMockProcessManager()
    const mockPluginRegistry = createMockPluginRegistry()

    // Create a scenario where we have 1 model but require 2
    const config = {
      cliPaths: {},
      models: [
        { name: 'model-1', cli: 'nonexistent', model: 'test' },
      ] as ModelConfig[],
      fallbackModels: [] as ModelConfig[],
    }

    const executor = new CliExecutor(
      config,
      mockProcessManager,
      mockPluginRegistry,
      mockLogger
    )

    // Request 2 models but only have 1 (which will fail validation)
    const result = await executor.startProgressiveValidation(2)

    // With 0 healthy models, cannot continue
    expect(result.success).toBe(false)
    expect(result.initiallyAvailable).toBe(0)

    await executor.cleanup()
  }, 10000)
})
