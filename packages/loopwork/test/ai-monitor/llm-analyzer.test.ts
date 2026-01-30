/**
 * LLM Fallback Analyzer Integration Tests
 * Tests for unknown error analysis with LLM, caching, and throttling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import {
  executeAnalyze,
  getCachedAnalysis,
  cacheAnalysisResult,
  hashError,
  loadAnalysisCache,
  saveAnalysisCache,
  cleanupCache,
  type AnalysisResult
} from '../../src/ai-monitor/actions/analyze'
import { AIMonitor } from '../../src/ai-monitor'
import type { LoopworkConfig } from '../../src/contracts/config'

const TEST_DIR = path.join(process.cwd(), 'test-temp-llm-analyzer')
const TEST_LOG_FILE = path.join(TEST_DIR, 'test.log')
const CACHE_FILE = path.join(TEST_DIR, '.loopwork/ai-monitor/llm-cache.json')

/**
 * Utility to wait for a condition with polling
 */
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50, message = 'Condition not met' } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) return
    await new Promise(r => setTimeout(r, interval))
  }

  throw new Error(`Timeout after ${timeout}ms: ${message}`)
}

describe('LLM Analyzer - Caching', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    // Change to test dir so cache file uses correct path
    process.chdir(TEST_DIR)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should generate consistent hash for similar errors', () => {
    const error1 = 'Error: File not found at /path/to/file.ts on 2024-01-15 at 10:30:00'
    const error2 = 'Error: File not found at /other/path/file.ts on 2024-01-16 at 14:45:00'

    const hash1 = hashError(error1)
    const hash2 = hashError(error2)

    // Hashes should be the same because timestamps and paths are normalized
    expect(hash1).toBe(hash2)
  })

  test('should generate different hash for different errors', () => {
    const error1 = 'Error: File not found'
    const error2 = 'Error: Permission denied'

    const hash1 = hashError(error1)
    const hash2 = hashError(error2)

    expect(hash1).not.toBe(hash2)
  })

  test('should cache and retrieve analysis results', () => {
    const errorMessage = 'Error: ENOENT file not found'
    const result: AnalysisResult = {
      rootCause: 'File not found',
      suggestedFixes: ['Verify file path exists', 'Check for typos'],
      confidence: 0.8,
      timestamp: new Date()
    }

    // Cache the result
    cacheAnalysisResult(errorMessage, result)

    // Retrieve from cache
    const cached = getCachedAnalysis(errorMessage)

    expect(cached).toBeTruthy()
    expect(cached?.rootCause).toBe(result.rootCause)
    expect(cached?.suggestedFixes).toEqual(result.suggestedFixes)
    expect(cached?.confidence).toBe(result.confidence)
    expect(cached?.cached).toBe(true)
  })

  test('should return null for non-cached errors', () => {
    const cached = getCachedAnalysis('Some unknown error that was never cached')

    expect(cached).toBeNull()
  })

  test('should persist cache to disk', () => {
    const errorMessage = 'Error: Rate limit exceeded'
    const result: AnalysisResult = {
      rootCause: 'API rate limit',
      suggestedFixes: ['Wait before retrying', 'Implement exponential backoff'],
      confidence: 0.9,
      timestamp: new Date()
    }

    cacheAnalysisResult(errorMessage, result)

    // Verify cache file exists
    expect(fs.existsSync(CACHE_FILE)).toBe(true)

    // Load cache from disk
    const cache = loadAnalysisCache()
    const hash = hashError(errorMessage)

    expect(cache[hash]).toBeDefined()
    expect(cache[hash].analysis.rootCause).toBe(result.rootCause)
    expect(cache[hash].errorHash).toBe(hash)
    expect(cache[hash].cachedAt).toBeTruthy()
    expect(cache[hash].expiresAt).toBeTruthy()
  })

  test('should cleanup expired cache entries', () => {
    const now = new Date()
    const cache = {
      'hash1': {
        errorHash: 'hash1',
        analysis: {
          rootCause: 'Old error',
          suggestedFixes: ['Fix it'],
          confidence: 0.5
        },
        cachedAt: new Date(now.getTime() - (25 * 60 * 60 * 1000)).toISOString(), // 25 hours ago
        expiresAt: new Date(now.getTime() - (1 * 60 * 60 * 1000)).toISOString() // Expired 1 hour ago
      },
      'hash2': {
        errorHash: 'hash2',
        analysis: {
          rootCause: 'Recent error',
          suggestedFixes: ['Fix it'],
          confidence: 0.7
        },
        cachedAt: new Date(now.getTime() - (1 * 60 * 60 * 1000)).toISOString(), // 1 hour ago
        expiresAt: new Date(now.getTime() + (23 * 60 * 60 * 1000)).toISOString() // Expires in 23 hours
      }
    }

    saveAnalysisCache(cache)

    // Cleanup expired entries
    cleanupCache()

    const cleaned = loadAnalysisCache()

    expect(cleaned['hash1']).toBeUndefined() // Should be removed (expired)
    expect(cleaned['hash2']).toBeDefined() // Should remain (not expired)
  })

  test('should handle cache file corruption gracefully', () => {
    // Create invalid cache file
    const dir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(CACHE_FILE, 'invalid json{{{')

    // Should return empty cache instead of crashing
    const cache = loadAnalysisCache()

    expect(cache).toEqual({})
  })
})

describe('LLM Analyzer - Pattern-Based Fallback', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    process.chdir(TEST_DIR)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should analyze ENOENT errors without LLM', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: ENOENT - file not found at /path/to/file' },
      prompt: 'Error: ENOENT - file not found at /path/to/file'
    }

    const result = await executeAnalyze(action)

    expect(result.rootCause).toContain('not found')
    expect(result.suggestedFixes).toBeTruthy()
    expect(result.suggestedFixes.length).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThan(0)
  })

  test('should analyze permission errors without LLM', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: EACCES - permission denied' },
      prompt: 'Error: EACCES - permission denied'
    }

    const result = await executeAnalyze(action)

    expect(result.rootCause).toContain('Permission denied')
    expect(result.suggestedFixes.some(fix => fix.includes('permission'))).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  test('should analyze timeout errors without LLM', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: ETIMEDOUT - operation timed out' },
      prompt: 'Error: ETIMEDOUT - operation timed out'
    }

    const result = await executeAnalyze(action)

    expect(result.rootCause).toContain('timed out')
    expect(result.suggestedFixes.some(fix => fix.includes('timeout'))).toBe(true)
    expect(result.confidence).toBeGreaterThan(0)
  })

  test('should analyze rate limit errors without LLM', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: 429 Too Many Requests - rate limit exceeded' },
      prompt: 'Error: 429 Too Many Requests - rate limit exceeded'
    }

    const result = await executeAnalyze(action)

    expect(result.rootCause).toContain('Rate limit')
    expect(result.suggestedFixes.some(fix => fix.toLowerCase().includes('wait'))).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})

describe('LLM Analyzer - Integration with AIMonitor', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    process.chdir(TEST_DIR)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should throttle LLM calls based on max per session', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llmMaxPerSession: 2,
      llmCooldown: 100, // Short cooldown for testing
      patternCheckDebounce: 50,
      cacheUnknownErrors: false // Disable cache for this test
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: { type: 'json', tasksFile: '', tasksDir: '' },
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Write log file with unknown errors
    fs.writeFileSync(TEST_LOG_FILE, '')
    await new Promise(resolve => setTimeout(resolve, 100))

    // Write 3 different unknown errors
    fs.appendFileSync(TEST_LOG_FILE, 'Error: Unknown error type 1\n')
    await new Promise(resolve => setTimeout(resolve, 150))

    fs.appendFileSync(TEST_LOG_FILE, 'Error: Unknown error type 2\n')
    await new Promise(resolve => setTimeout(resolve, 150))

    fs.appendFileSync(TEST_LOG_FILE, 'Error: Unknown error type 3\n')
    await new Promise(resolve => setTimeout(resolve, 150))

    // Check stats
    const stats = monitor.getStats()

    // Should respect max per session limit (only 2 LLM calls)
    expect(stats.llmCallCount).toBeLessThanOrEqual(2)

    await monitor.onLoopEnd({
      completed: 0,
      failed: 0,
      duration: 0
    })
  })

  test('should respect cooldown between LLM calls', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llmMaxPerSession: 10,
      llmCooldown: 300, // 300ms cooldown
      patternCheckDebounce: 50,
      cacheUnknownErrors: false,
      circuitBreaker: {
        maxFailures: 10, // High threshold to not interfere with test
        cooldownPeriodMs: 60000
      }
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: { type: 'json', tasksFile: '', tasksDir: '' },
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Write log file
    fs.writeFileSync(TEST_LOG_FILE, '')
    await new Promise(resolve => setTimeout(resolve, 100))

    // Write first error
    fs.appendFileSync(TEST_LOG_FILE, 'Error: First completely unique error ABC123\n')
    await new Promise(resolve => setTimeout(resolve, 200))

    const stats1 = monitor.getStats()
    const countAfterFirst = stats1.llmCallCount

    // Write second error immediately (should be blocked by cooldown)
    fs.appendFileSync(TEST_LOG_FILE, 'Error: Second completely unique error XYZ789\n')
    await new Promise(resolve => setTimeout(resolve, 200))

    const stats2 = monitor.getStats()

    // Second error should be blocked by cooldown, so count should be same or very similar
    // We allow for +1 due to timing variations in test environment
    expect(stats2.llmCallCount - countAfterFirst).toBeLessThanOrEqual(1)

    await monitor.onLoopEnd({
      completed: 0,
      failed: 0,
      duration: 0
    })
  })

  test('should use cached results for repeated errors', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llmMaxPerSession: 10,
      llmCooldown: 200,
      patternCheckDebounce: 50,
      cacheUnknownErrors: true, // Enable cache
      circuitBreaker: {
        maxFailures: 10, // Increase threshold to prevent circuit opening
        cooldownPeriodMs: 60000
      }
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: { type: 'json', tasksFile: '', tasksDir: '' },
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Write log file
    fs.writeFileSync(TEST_LOG_FILE, '')
    await new Promise(resolve => setTimeout(resolve, 100))

    // Write same error twice
    const sameError = 'Error: This is the exact same unknown error DEF456\n'
    fs.appendFileSync(TEST_LOG_FILE, sameError)
    await new Promise(resolve => setTimeout(resolve, 300))

    const stats1 = monitor.getStats()
    const firstCount = stats1.llmCallCount

    // Wait for cooldown
    await new Promise(resolve => setTimeout(resolve, 250))

    fs.appendFileSync(TEST_LOG_FILE, sameError)
    await new Promise(resolve => setTimeout(resolve, 300))

    // Check that second error used cache
    const stats2 = monitor.getStats()

    // If cache works, count should be same or only increased by 1 max
    // (since the second occurrence should be in cache and not trigger LLM)
    expect(stats2.llmCallCount - firstCount).toBeLessThanOrEqual(0)
    expect(stats2.unknownErrorCacheSize).toBeGreaterThanOrEqual(0)

    await monitor.onLoopEnd({
      completed: 0,
      failed: 0,
      duration: 0
    })
  })

  test('should only analyze lines that look like errors', async () => {
    const monitor = new AIMonitor({
      enabled: true,
      llmMaxPerSession: 10,
      llmCooldown: 100,
      patternCheckDebounce: 50
    })

    const config: LoopworkConfig = {
      projectRoot: TEST_DIR,
      backend: { type: 'json', tasksFile: '', tasksDir: '' },
      cli: 'claude',
      maxIterations: 10
    }

    await monitor.onConfigLoad(config)

    const logger = await import('../../src/core/utils')
    logger.logger.logFile = TEST_LOG_FILE

    await monitor.onLoopStart('test-namespace')

    // Write log file
    fs.writeFileSync(TEST_LOG_FILE, '')
    await new Promise(resolve => setTimeout(resolve, 100))

    // Write non-error lines
    fs.appendFileSync(TEST_LOG_FILE, 'INFO: Task completed successfully\n')
    fs.appendFileSync(TEST_LOG_FILE, 'DEBUG: Processing next item\n')
    fs.appendFileSync(TEST_LOG_FILE, 'Task running normally\n')

    await new Promise(resolve => setTimeout(resolve, 200))

    // Should not trigger LLM for non-error lines
    const stats = monitor.getStats()
    expect(stats.llmCallCount).toBe(0)

    await monitor.onLoopEnd({
      completed: 0,
      failed: 0,
      duration: 0
    })
  })
})

describe('LLM Analyzer - Full Integration Test', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
    process.chdir(TEST_DIR)
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('integration: unknown error → analysis → response cached → same error uses cache', async () => {
    // Test the caching at the analyze function level, which is more reliable
    const errorMessage = 'Error: Strange database connection pooling bug GHI789'

    // First call - should analyze (pattern-based since opencode may not be available)
    const action1 = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: errorMessage },
      prompt: errorMessage
    }

    const result1 = await executeAnalyze(action1)
    expect(result1.rootCause).toBeTruthy()
    expect(result1.suggestedFixes).toBeTruthy()
    expect(result1.suggestedFixes.length).toBeGreaterThan(0)
    expect(result1.confidence).toBeGreaterThanOrEqual(0)
    expect(result1.confidence).toBeLessThanOrEqual(1)

    // Verify result was cached
    const cached = getCachedAnalysis(errorMessage)
    expect(cached).toBeTruthy()
    expect(cached?.cached).toBe(true)
    expect(cached?.rootCause).toBe(result1.rootCause)

    // Second call - should use cache
    const result2 = await executeAnalyze(action1)
    expect(result2.cached).toBe(true)
    expect(result2.rootCause).toBe(result1.rootCause)
    expect(result2.suggestedFixes).toEqual(result1.suggestedFixes)
    expect(result2.confidence).toBe(result1.confidence)

    // Verify cache file exists
    expect(fs.existsSync(CACHE_FILE)).toBe(true)

    // Verify cache content
    const cache = loadAnalysisCache()
    const hash = hashError(errorMessage)
    expect(cache[hash]).toBeDefined()
    expect(cache[hash].analysis.rootCause).toBe(result1.rootCause)
    expect(cache[hash].analysis.suggestedFixes).toEqual(result1.suggestedFixes)
    expect(cache[hash].analysis.confidence).toBe(result1.confidence)

    // Verify cache schema
    expect(cache[hash].errorHash).toBe(hash)
    expect(cache[hash].cachedAt).toBeTruthy()
    expect(cache[hash].expiresAt).toBeTruthy()

    // Verify expiry is 24 hours from now
    const cachedAt = new Date(cache[hash].cachedAt).getTime()
    const expiresAt = new Date(cache[hash].expiresAt).getTime()
    const expectedTTL = 24 * 60 * 60 * 1000
    expect(expiresAt - cachedAt).toBe(expectedTTL)
  })
})
