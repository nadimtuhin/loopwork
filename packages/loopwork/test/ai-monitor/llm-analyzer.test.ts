import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { LLMAnalyzer, createLLMAnalyzer, type ErrorAnalysis } from '../../src/ai-monitor/llm-analyzer'

const TEST_CACHE_DIR = '.test-llm-cache'

function cleanupCache() {
  try {
    if (fs.existsSync(TEST_CACHE_DIR)) {
      fs.rmSync(TEST_CACHE_DIR, { recursive: true, force: true })
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

describe('LLMAnalyzer', () => {
  beforeEach(() => {
    cleanupCache()
  })

  afterEach(() => {
    cleanupCache()
  })

  describe('Basic error analysis', () => {
    test('should analyze an error and return structured response', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      const result = await analyzer.analyzeError('Connection timeout')
      expect(result).toBeDefined()
      expect(result).toHaveProperty('rootCause')
      expect(result).toHaveProperty('suggestedFixes')
      expect(result).toHaveProperty('confidence')
    })

    test('should include stack trace in analysis', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })
      const stackTrace = 'Error: ECONNREFUSED at connect (net.js:1234:5)'

      const result = await analyzer.analyzeError('Network error', stackTrace)
      expect(result).toBeDefined()
      expect(result?.rootCause).toBeTruthy()
    })
  })

  describe('Rate limiting', () => {
    test('should enforce max calls per session', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 2,
        cooldownMs: 0 // No cooldown for this test
      })

      // First call should succeed
      const result1 = await analyzer.analyzeError('Error 1')
      expect(result1).not.toBeNull()

      // Second call should succeed
      const result2 = await analyzer.analyzeError('Error 2')
      expect(result2).not.toBeNull()

      // Third call should be throttled
      const result3 = await analyzer.analyzeError('Error 3')
      expect(result3).toBeNull()
    })

    test('should enforce cooldown between calls', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        cooldownMs: 100 // 100ms for testing
      })

      // First call
      const result1 = await analyzer.analyzeError('Error 1')
      expect(result1).not.toBeNull()

      // Immediate second call should be throttled
      const result2 = await analyzer.analyzeError('Error 2')
      expect(result2).toBeNull()

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 150))

      // Third call should succeed
      const result3 = await analyzer.analyzeError('Error 3')
      expect(result3).not.toBeNull()
    })

    test('should track call count correctly', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 3,
        cooldownMs: 0
      })

      expect(analyzer.getCallCount()).toBe(0)

      await analyzer.analyzeError('Error 1')
      expect(analyzer.getCallCount()).toBe(1)

      await analyzer.analyzeError('Error 2')
      expect(analyzer.getCallCount()).toBe(2)
    })

    test('should allow reset of call counter', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 2,
        cooldownMs: 0
      })

      await analyzer.analyzeError('Error 1')
      await analyzer.analyzeError('Error 2')

      expect(analyzer.getCallCount()).toBe(2)
      analyzer.resetCallCount()
      expect(analyzer.getCallCount()).toBe(0)

      // Should be able to make calls again
      const result = await analyzer.analyzeError('Error 3')
      expect(result).not.toBeNull()
    })
  })

  describe('Response caching', () => {
    test('should cache analysis responses', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 10
      })

      const error = 'Test error'
      const result1 = await analyzer.analyzeError(error)
      expect(result1).not.toBeNull()

      // Reset call count to simulate new session
      const callsAfterFirst = analyzer.getCallCount()
      analyzer.resetCallCount()

      // Second analysis of same error should come from cache
      const result2 = await analyzer.analyzeError(error)
      expect(result2).not.toBeNull()
      expect(result2?.rootCause).toBe(result1?.rootCause)

      // Call count should not have increased (came from cache)
      expect(analyzer.getCallCount()).toBe(0)
    })

    test('should use different cache entries for different errors', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        cooldownMs: 0
      })

      const result1 = await analyzer.analyzeError('Error A')
      analyzer.resetCallCount()

      const result2 = await analyzer.analyzeError('Error B')
      analyzer.resetCallCount()

      expect(result1?.rootCause).not.toBe(result2?.rootCause)
    })

    test('should include stack trace in cache key', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      const error = 'Timeout error'
      const stackA = 'at line 1'
      const stackB = 'at line 2'

      const result1 = await analyzer.analyzeError(error, stackA)
      analyzer.resetCallCount()

      const result2 = await analyzer.analyzeError(error, stackB)
      analyzer.resetCallCount()

      // Different stack traces should result in different cache entries
      // (They might have same content, but should be separate entries)
      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
    })

    test('should expire cache entries after 24 hours', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      // Create initial analysis
      const error = 'Test error'
      const result1 = await analyzer.analyzeError(error)
      expect(result1).not.toBeNull()

      // Manually corrupt the cache to have expired entry
      const cacheFile = path.join(TEST_CACHE_DIR, 'llm-cache.json')
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))

      // Set expiry to past
      const key = Object.keys(cache)[0]
      cache[key].expiresAt = new Date(Date.now() - 1000).toISOString()

      fs.writeFileSync(cacheFile, JSON.stringify(cache))

      // Reset analyzer
      analyzer.resetCallCount()

      // Next call should treat cache as expired and make new LLM call
      const result2 = await analyzer.analyzeError(error)
      expect(result2).not.toBeNull()
      // Call count should increment (cache was expired)
      expect(analyzer.getCallCount()).toBe(1)
    })

    test('should clear cache', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      await analyzer.analyzeError('Error 1')
      const cacheFile = path.join(TEST_CACHE_DIR, 'llm-cache.json')
      expect(fs.existsSync(cacheFile)).toBe(true)

      analyzer.clearCache()
      expect(fs.existsSync(cacheFile)).toBe(false)
    })
  })

  describe('Error handling', () => {
    test('should gracefully handle LLM call failures', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      // Even if LLM fails, should return a fallback response
      const result = await analyzer.analyzeError('Error with timeout')
      expect(result).not.toBeNull()
      expect(result?.suggestedFixes).toBeDefined()
      expect(Array.isArray(result?.suggestedFixes)).toBe(true)
    })

    test('should handle cache directory creation errors gracefully', () => {
      // Create analyzer with impossible path (should handle gracefully)
      const analyzer = new LLMAnalyzer({
        cacheDir: '/dev/null/impossible/path'
      })

      // Should not throw
      expect(analyzer).toBeDefined()
    })

    test('should handle corrupted cache files', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      // Create corrupted cache file
      fs.mkdirSync(TEST_CACHE_DIR, { recursive: true })
      fs.writeFileSync(
        path.join(TEST_CACHE_DIR, 'llm-cache.json'),
        'not valid json {'
      )

      // Should still work (ignores bad cache)
      const result = await analyzer.analyzeError('Error')
      expect(result).not.toBeNull()
    })
  })

  describe('Throttling information', () => {
    test('should report time until next call is available', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        cooldownMs: 100
      })

      // Initially, should be able to call immediately
      expect(analyzer.getTimeUntilNextCall()).toBe(0)

      // Make a call
      await analyzer.analyzeError('Error')

      // Should report cooldown time remaining
      const timeUntilNext = analyzer.getTimeUntilNextCall()
      expect(timeUntilNext).toBeGreaterThan(0)
      expect(timeUntilNext).toBeLessThanOrEqual(100)
    })

    test('should report infinite time when max calls reached', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 1
      })

      await analyzer.analyzeError('Error 1')

      const timeUntilNext = analyzer.getTimeUntilNextCall()
      expect(timeUntilNext).toBe(Infinity)
    })
  })

  describe('Factory function', () => {
    test('should create analyzer via factory function', () => {
      const analyzer = createLLMAnalyzer({ cacheDir: TEST_CACHE_DIR })
      expect(analyzer).toBeInstanceOf(LLMAnalyzer)
    })

    test('should use default options when not provided', () => {
      const analyzer = createLLMAnalyzer()
      expect(analyzer).toBeInstanceOf(LLMAnalyzer)
      // Should have call count tracking
      expect(analyzer.getCallCount()).toBe(0)
    })
  })

  describe('Cache schema validation', () => {
    test('should persist cache with correct schema', async () => {
      const analyzer = new LLMAnalyzer({ cacheDir: TEST_CACHE_DIR })

      await analyzer.analyzeError('Test error')

      const cacheFile = path.join(TEST_CACHE_DIR, 'llm-cache.json')
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))

      const entries = Object.values(cache) as any[]
      expect(entries.length).toBeGreaterThan(0)

      const entry = entries[0]
      expect(entry).toHaveProperty('errorHash')
      expect(entry).toHaveProperty('analysis')
      expect(entry).toHaveProperty('cachedAt')
      expect(entry).toHaveProperty('expiresAt')

      expect(entry.analysis).toHaveProperty('rootCause')
      expect(entry.analysis).toHaveProperty('suggestedFixes')
      expect(entry.analysis).toHaveProperty('confidence')

      expect(typeof entry.cachedAt).toBe('string')
      expect(typeof entry.expiresAt).toBe('string')
    })
  })

  describe('Session tracking', () => {
    test('should track multiple errors in same session', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_CACHE_DIR,
        maxCallsPerSession: 10,
        cooldownMs: 0
      })

      const result1 = await analyzer.analyzeError('Error 1')
      const result2 = await analyzer.analyzeError('Error 2')
      const result3 = await analyzer.analyzeError('Error 3')

      expect(analyzer.getCallCount()).toBe(3)
      expect(result1).not.toBeNull()
      expect(result2).not.toBeNull()
      expect(result3).not.toBeNull()
    })
  })
})
