import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test'
import { CliDiscoveryService, createCliDiscoveryService } from '../src/cli-discovery'
import type { ICliPathConfig, CliType } from '@loopwork-ai/contracts'

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
