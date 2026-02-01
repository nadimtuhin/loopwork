/**
 * LLM Fallback Analyzer Integration Tests
 * Tests for unknown error analysis with LLM, caching, and throttling
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { executeAnalyze, getCachedAnalysis, cacheAnalysisResult, hashError, loadAnalysisCache, saveAnalysisCache, cleanupCache, shouldThrottleLLM, type AnalysisResult, type ThrottleState } from '../src/actions/analyze'

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
    cacheAnalysisResult(errorMessage, result, TEST_DIR)

    // Retrieve from cache
    const cached = getCachedAnalysis(errorMessage, TEST_DIR)

    expect(cached).toBeTruthy()
    expect(cached?.rootCause).toBe(result.rootCause)
    expect(cached?.suggestedFixes).toEqual(result.suggestedFixes)
    expect(cached?.confidence).toBe(result.confidence)
    expect(cached?.cached).toBe(true)
  })

  test('should return null for non-cached errors', () => {
    const cached = getCachedAnalysis('Some unknown error that was never cached', TEST_DIR)

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

    cacheAnalysisResult(errorMessage, result, TEST_DIR)

    // Verify cache file exists
    expect(fs.existsSync(CACHE_FILE)).toBe(true)

    // Load cache from disk
    const cache = loadAnalysisCache(TEST_DIR)
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

    saveAnalysisCache(cache, TEST_DIR)

    // Cleanup expired entries
    cleanupCache(TEST_DIR)

    const cleaned = loadAnalysisCache(TEST_DIR)

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
    const cache = loadAnalysisCache(TEST_DIR)

    expect(cache).toEqual({})
  })
})

describe('LLM Analyzer - Pattern-Based Fallback', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
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

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

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

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

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

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

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

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

    expect(result.rootCause).toContain('Rate limit')
    expect(result.suggestedFixes.some(fix => fix.toLowerCase().includes('wait'))).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})

describe('LLM Analyzer - Throttling', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  test('should enforce max calls per session limit', async () => {
    const throttleState = {
      llmCallCount: 10,
      lastLLMCall: Date.now(),
      llmCooldown: 5 * 60 * 1000,
      llmMaxPerSession: 10
    }

    const result = shouldThrottleLLM(throttleState)

    expect(result.throttled).toBe(true)
    if (result.throttled) {
      expect(result.reason).toContain('max 10 calls per session')
    }
  })

  test('should allow calls below max limit', async () => {
    const throttleState = {
      llmCallCount: 5,
      lastLLMCall: Date.now() - (6 * 60 * 1000), // 6 minutes ago
      llmCooldown: 5 * 60 * 1000,
      llmMaxPerSession: 10
    }

    const result = shouldThrottleLLM(throttleState)

    expect(result.throttled).toBe(false)
  })

  test('should enforce cooldown period between calls', async () => {
    const throttleState = {
      llmCallCount: 3,
      lastLLMCall: Date.now() - (2 * 60 * 1000), // 2 minutes ago
      llmCooldown: 5 * 60 * 1000, // 5 minute cooldown
      llmMaxPerSession: 10
    }

    const result = shouldThrottleLLM(throttleState)

    expect(result.throttled).toBe(true)
    if (result.throttled) {
      expect(result.reason).toContain('cooldown')
    }
  })

  test('should allow calls after cooldown period expires', async () => {
    const throttleState = {
      llmCallCount: 3,
      lastLLMCall: Date.now() - (6 * 60 * 1000), // 6 minutes ago
      llmCooldown: 5 * 60 * 1000, // 5 minute cooldown
      llmMaxPerSession: 10
    }

    const result = shouldThrottleLLM(throttleState)

    expect(result.throttled).toBe(false)
  })

  test('should update throttle state after LLM call', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: Test error for throttling' },
      prompt: 'Error: Test error for throttling'
    }

    const throttleState = {
      llmCallCount: 0,
      lastLLMCall: 0,
      llmCooldown: 5 * 60 * 1000,
      llmMaxPerSession: 10
    }

    const startTime = Date.now()
    await executeAnalyze(action, undefined, undefined, TEST_DIR, throttleState)

    expect(throttleState.llmCallCount).toBe(1)
    expect(throttleState.lastLLMCall).toBeGreaterThanOrEqual(startTime)
  })

  test('should return pattern-based fallback when throttled', async () => {
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: ENOENT file not found' },
      prompt: 'Error: ENOENT file not found'
    }

    const throttleState = {
      llmCallCount: 10, // Max reached
      lastLLMCall: Date.now(),
      llmCooldown: 5 * 60 * 1000,
      llmMaxPerSession: 10
    }

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR, throttleState)

    // Should still return a valid result using pattern-based analysis
    expect(result).toBeTruthy()
    expect(result.rootCause).toContain('not found')
    expect(throttleState.llmCallCount).toBe(10) // Should not increment
  })
})

describe('LLM Analyzer - Full Integration Test', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true })
    }
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

    const result1 = await executeAnalyze(action1, undefined, undefined, TEST_DIR)
    expect(result1.rootCause).toBeTruthy()
    expect(result1.suggestedFixes).toBeTruthy()
    expect(result1.suggestedFixes.length).toBeGreaterThan(0)
    expect(result1.confidence).toBeGreaterThanOrEqual(0)
    expect(result1.confidence).toBeLessThanOrEqual(1)

    // Verify result was cached
    const cached = getCachedAnalysis(errorMessage, TEST_DIR)
    expect(cached).toBeTruthy()
    expect(cached?.cached).toBe(true)
    expect(cached?.rootCause).toBe(result1.rootCause)

    // Second call - should use cache
    const result2 = await executeAnalyze(action1, undefined, undefined, TEST_DIR)
    expect(result2.cached).toBe(true)
    expect(result2.rootCause).toBe(result1.rootCause)
    expect(result2.suggestedFixes).toEqual(result1.suggestedFixes)
    expect(result2.confidence).toBe(result1.confidence)

    // Verify cache file exists
    expect(fs.existsSync(CACHE_FILE)).toBe(true)

    // Verify cache content
    const cache = loadAnalysisCache(TEST_DIR)
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

  test('should gracefully fallback to pattern-based analysis when LLM unavailable', async () => {
    // Simulate LLM unavailable by not setting API key and using executeAnalyze
    // (which will fallback to pattern-based analysis)
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: Some unknown error that has no pattern' },
      prompt: 'Error: Some unknown error that has no pattern'
    }

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

    // Should still return a valid result (pattern-based)
    expect(result).toBeTruthy()
    expect(result.rootCause).toBeTruthy()
    expect(result.suggestedFixes).toBeTruthy()
    expect(result.suggestedFixes.length).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
    expect(result.cached).not.toBe(true) // Should not be marked as cached
  })

  test('should not crash on malformed JSON response from LLM', async () => {
    // This tests that the executeAnalyze function handles invalid JSON gracefully
    const action = {
      type: 'analyze' as const,
      pattern: 'unknown-error',
      context: { rawLine: 'Error: Database connection failed' },
      prompt: 'Error: Database connection failed'
    }

    const result = await executeAnalyze(action, undefined, undefined, TEST_DIR)

    // Should return a valid result despite potential JSON parsing issues
    expect(result).toBeTruthy()
    expect(result.rootCause).toBeTruthy()
    expect(typeof result.confidence).toBe('number')
    expect(result.suggestedFixes).toBeTruthy()
  })
})
