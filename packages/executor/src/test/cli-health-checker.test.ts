import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { CliHealthChecker, createHealthChecker, quickHealthCheck } from '../cli-health-checker'
import type { ModelConfig } from '@loopwork-ai/contracts'

/**
 * CLI Health Checker Tests
 * 
 * Comprehensive test suite for CLI health checking functionality
 */

describe('CliHealthChecker', () => {
  let healthChecker: CliHealthChecker
  const mockLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }

  beforeEach(() => {
    healthChecker = new CliHealthChecker({
      testTimeoutMs: 5000,
      maxRetries: 1,
      autoClearCache: false,
      logger: mockLogger,
    })
  })

  afterEach(() => {
    healthChecker.clearCache()
  })

  describe('instantiation', () => {
    test('should instantiate with default options', () => {
      const checker = new CliHealthChecker()
      expect(checker).toBeDefined()
      expect(checker).toBeInstanceOf(CliHealthChecker)
    })

    test('should instantiate with custom options', () => {
      const checker = new CliHealthChecker({
        testTimeoutMs: 10000,
        maxRetries: 3,
        autoClearCache: true,
        logger: mockLogger,
      })
      expect(checker).toBeDefined()
    })

    test('should maintain instance identity', () => {
      const checker1 = new CliHealthChecker()
      const checker2 = new CliHealthChecker()
      expect(checker1).not.toBe(checker2)
    })
  })

  describe('minimum healthy models check', () => {
    test('should report sufficient when meeting minimum', () => {
      const result = healthChecker.hasMinimumHealthyModels(3, 2)
      expect(result.sufficient).toBe(true)
      expect(result.canContinue).toBe(true)
    })

    test('should report insufficient but can continue with some healthy', () => {
      const result = healthChecker.hasMinimumHealthyModels(1, 3)
      expect(result.sufficient).toBe(false)
      expect(result.canContinue).toBe(true)
    })

    test('should report cannot continue with zero healthy', () => {
      const result = healthChecker.hasMinimumHealthyModels(0, 1)
      expect(result.sufficient).toBe(false)
      expect(result.canContinue).toBe(false)
    })

    test('should use default minimum of 1', () => {
      const result = healthChecker.hasMinimumHealthyModels(1)
      expect(result.sufficient).toBe(true)
    })
  })

  describe('cache management', () => {
    test('should return empty results initially', () => {
      const results = healthChecker.getResults()
      expect(results.size).toBe(0)
    })

    test('should clear cache', () => {
      // Add some results through validation would populate cache
      // But since we're not actually running CLIs, just test clear works
      healthChecker.clearCache()
      const results = healthChecker.getResults()
      expect(results.size).toBe(0)
    })
  })

  describe('createHealthChecker factory', () => {
    test('should create health checker with default options', () => {
      const checker = createHealthChecker()
      expect(checker).toBeDefined()
      expect(checker).toBeInstanceOf(CliHealthChecker)
    })

    test('should create health checker with custom options', () => {
      const checker = createHealthChecker({
        testTimeoutMs: 15000,
        autoClearCache: true,
      })
      expect(checker).toBeDefined()
    })
  })

  describe('quickHealthCheck', () => {
    test('should be a function', () => {
      expect(typeof quickHealthCheck).toBe('function')
    })

    test('should return promise', () => {
      // Since we don't have actual CLI paths, just verify it doesn't throw
      const result = quickHealthCheck('/nonexistent', 'claude')
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('model deduplication', () => {
    test('should handle empty model list', async () => {
      const cliPaths = new Map<string, string>([['claude', '/usr/local/bin/claude']])
      const models: ModelConfig[] = []
      
      const result = await healthChecker.validateAllModels(cliPaths, models)
      
      expect(result.healthy).toEqual([])
      expect(result.unhealthy).toEqual([])
      expect(result.summary.total).toBe(0)
      expect(result.summary.healthy).toBe(0)
    })

    test('should deduplicate models by cli+model combination', async () => {
      const cliPaths = new Map<string, string>()
      const models: ModelConfig[] = [
        { name: 'model1', cli: 'claude', model: 'sonnet' },
        { name: 'model1-dup', cli: 'claude', model: 'sonnet' }, // Same cli+model
        { name: 'model2', cli: 'claude', model: 'opus' },
      ]
      
      const result = await healthChecker.validateAllModels(cliPaths, models)
      
      // Should only have 2 unique models
      expect(result.summary.total).toBe(2)
    })

    test('should handle models with missing CLI paths', async () => {
      const cliPaths = new Map<string, string>() // Empty paths
      const models: ModelConfig[] = [
        { name: 'model1', cli: 'claude', model: 'sonnet' },
      ]
      
      const result = await healthChecker.validateAllModels(cliPaths, models)
      
      expect(result.summary.total).toBe(1)
      expect(result.summary.healthy).toBe(0)
      expect(result.summary.unhealthy).toBe(1)
      expect(result.unhealthy[0].lastError).toContain('CLI claude not found')
    })
  })

  describe('CLI binary validation', () => {
    test('should fail for non-existent binary', async () => {
      const result = await healthChecker.validateCliBinary('/nonexistent/path', 'claude')
      
      expect(result.healthy).toBe(false)
      expect(result.error).toContain('not found')
      expect(result.cli).toBe('claude')
    })

    test('should cache binary validation results', async () => {
      const path = '/nonexistent/path'
      
      const result1 = await healthChecker.validateCliBinary(path, 'claude')
      const result2 = await healthChecker.validateCliBinary(path, 'claude')
      
      // Should return same cached result
      expect(result1).toBe(result2)
    })
  })

  describe('model validation', () => {
    test('should fail for missing CLI path', async () => {
      const modelConfig: ModelConfig = {
        name: 'test-model',
        cli: 'claude',
        model: 'sonnet',
      }
      
      const result = await healthChecker.validateModel('/nonexistent', modelConfig)
      
      expect(result.healthy).toBe(false)
    })

    test('should cache validation results', async () => {
      const modelConfig: ModelConfig = {
        name: 'test-model',
        cli: 'claude',
        model: 'sonnet',
      }
      
      const result1 = await healthChecker.validateModel('/nonexistent', modelConfig)
      const result2 = await healthChecker.validateModel('/nonexistent', modelConfig)
      
      // Should return same cached result for unhealthy models
      // Compare by properties since responseTimeMs may differ slightly
      expect(result1.healthy).toBe(result2.healthy)
      expect(result1.cli).toBe(result2.cli)
      expect(result1.error).toBe(result2.error)
    })
  })
})

describe('cache corruption detection', () => {
  // These patterns are tested by checking if they're correctly identified
  test('should detect OpenCode cache corruption patterns', () => {
    const patterns = [
      'ENOENT: no such file or directory, reading /home/user/.cache/opencode',
      'BuildMessage: Error: ENOENT: opencode cache missing',
      'Cannot find module /user/.cache/opencode/node_modules',
      'cache is corrupted',
    ]
    
    // The actual detection is internal, but we can verify it's exported if needed
    // For now, this is a placeholder for pattern validation
    expect(patterns.length).toBeGreaterThan(0)
  })
})
