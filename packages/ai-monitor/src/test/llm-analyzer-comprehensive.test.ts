/**
 * LLM Analyzer Tests
 *
 * Comprehensive test suite for LLM fallback analyzer including:
 * - Cache operations (read, write, expiration, cleanup)
 * - Rate limiting (call count, cooldown period)
 * - Error analysis (with and without API key)
 * - Graceful degradation
 */

import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { LLMAnalyzer, ErrorAnalysis, LLMAnalyzerOptions, createLLMAnalyzer } from '../llm-analyzer'

// Test directory path
const TEST_DIR = path.join(process.cwd(), 'test-temp-llm-analyzer')

describe('LLMAnalyzer', () => {
  let analyzer: LLMAnalyzer

  beforeEach(() => {
    // Clean test directory before each test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    // Create analyzer with test config
    analyzer = new LLMAnalyzer({
      cacheDir: TEST_DIR,
      maxCallsPerSession: 3, // Lower limit for testing
      cooldownMs: 100, // 100ms cooldown for testing
    })
  })

  afterEach(() => {
    // Clean up test directory after each test
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true })
    }
  })

  describe('Instantiation', () => {
    test('should create analyzer with default config', () => {
      const instance = new LLMAnalyzer()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(LLMAnalyzer)
    })

    test('should create analyzer with custom config', () => {
      const instance = new LLMAnalyzer({
        cacheDir: '/custom/cache/dir',
        maxCallsPerSession: 5,
        cooldownMs: 60000,
      })
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(LLMAnalyzer)
    })
  })

  describe('Cache Operations', () => {
    test('should cache analysis result', async () => {
      const errorMessage = 'Test error message'
      const stackTrace = 'Error stack trace line 1'

      const expectedResult: ErrorAnalysis = {
        rootCause: 'Test root cause',
        suggestedFixes: ['Fix 1', 'Fix 2'],
        confidence: 0.85
      }

      // Cache the result
      await analyzer.analyzeError(errorMessage, stackTrace)

      // Verify cache was written
      const cacheFile = path.join(TEST_DIR, 'llm-cache.json')
      expect(fs.existsSync(cacheFile)).toBe(true)

      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      expect(cache).toBeDefined()

      // Find the cached entry
      const entries = Object.values(cache)
      expect(entries.length).toBe(1)

      const entry = entries[0]
      expect(entry.analysis.rootCause).toBe(expectedResult.rootCause)
      expect(entry.analysis.suggestedFixes).toEqual(expectedResult.suggestedFixes)
      expect(entry.analysis.confidence).toBe(expectedResult.confidence)
      expect(entry.cachedAt).toBeDefined()
      expect(entry.expiresAt).toBeDefined()
    })

    test('should retrieve cached analysis', async () => {
      const errorMessage = 'Cached error message'

      const expectedResult1: ErrorAnalysis = {
        rootCause: 'Original analysis',
        suggestedFixes: ['Fix 1'],
        confidence: 0.9
      }

      // Cache the result
      await analyzer.analyzeError(errorMessage)

      // Analyze same error again - should use cache
      const result2 = await analyzer.analyzeError(errorMessage)

      expect(result2.rootCause).toBe(expectedResult1.rootCause)
      expect(result2.suggestedFixes).toEqual(expectedResult1.suggestedFixes)
    })

    test('should expire cached entries after TTL', async () => {
      const errorMessage = 'Expire test error'

      const result: ErrorAnalysis = {
        rootCause: 'Test root cause',
        suggestedFixes: ['Fix'],
        confidence: 0.8
      }

      // Cache with short TTL for testing
      const shortTTLAnalyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 10,
        cooldownMs: 0, // No cooldown
      })
      await shortTTLAnalyzer.analyzeError(errorMessage)

      // Manually modify cache to set old timestamp
      const cacheFile = path.join(TEST_DIR, 'llm-cache.json')
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'))
      const hash = Object.keys(cache)[0]
      cache[hash].cachedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
      cache[hash].expiresAt = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2))

      // Try to retrieve - should return null (cache miss)
      const analysisResult = await analyzer.analyzeError(errorMessage)
      expect(result).toBeNull()
    })

    test('should clear cache', () => {
      const errorMessage = 'Test error'
      const result: ErrorAnalysis = {
        rootCause: 'Test cause',
        suggestedFixes: ['Fix'],
        confidence: 0.7
      }

      // Cache the result
      analyzer.analyzeError(errorMessage)

      // Clear cache
      analyzer.clearCache()

      // Verify cache is empty
      const cacheFile = path.join(TEST_DIR, 'llm-cache.json')
      expect(fs.existsSync(cacheFile)).toBe(false)
    })
  })

  describe('Rate Limiting', () => {
    test('should enforce max calls per session', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 2,
        cooldownMs: 0,
      })

      // Make max calls
      await analyzer.analyzeError('Error 1')
      await analyzer.analyzeError('Error 2')

      // Third call should be throttled (return null)
      const analysisResult = await analyzer.analyzeError('Error 3')
      expect(result).toBeNull()

      // Verify call count is at max
      expect(analyzer.getCallCount()).toBe(2)
    })

    test('should enforce cooldown period', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 10,
        cooldownMs: 500, // 500ms cooldown
      })

      // Make first call
      await analyzer.analyzeError('Error 1')
      expect(analyzer.getCallCount()).toBe(1)

      // Try second call immediately - should be throttled
      const analysisResult = await analyzer.analyzeError('Error 2')
      expect(result).toBeNull()
      expect(analyzer.getTimeUntilNextCall()).toBeGreaterThan(0)
    })

    test('should allow call after cooldown expires', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 10,
        cooldownMs: 100, // 100ms cooldown
      })

      // Make first call
      await analyzer.analyzeError('Error 1')

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Second call should succeed
      const analysisResult = await analyzer.analyzeError('Error 2')
      expect(result).toBeDefined()
    })

    test('should reset call count', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 2,
        cooldownMs: 0,
      })

      // Make max calls
      await analyzer.analyzeError('Error 1')
      await analyzer.analyzeError('Error 2')
      expect(analyzer.getCallCount()).toBe(2)

      // Reset call count
      analyzer.resetCallCount()
      expect(analyzer.getCallCount()).toBe(0)

      // Should be able to make calls again
      await analyzer.analyzeError('Error 3')
      expect(analyzer.getCallCount()).toBe(1)
    })

    test('should return time until next call', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 10,
        cooldownMs: 1000,
      })

      // First call
      await analyzer.analyzeError('Error 1')
      const time1 = analyzer.getTimeUntilNextCall()
      expect(time1).toBe(1000) // Full cooldown

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500))

      // Should be less time remaining
      const time2 = analyzer.getTimeUntilNextCall()
      expect(time2).toBeGreaterThan(0)
      expect(time2).toBeLessThan(500)

      // After cooldown, should be 0
      await new Promise(resolve => setTimeout(resolve, 500))
      const time3 = analyzer.getTimeUntilNextCall()
      expect(time3).toBe(0)
    })
  })

  describe('Error Analysis', () => {
    test('should analyze error with mock response', async () => {
      // Set no API key to use mock
      const originalApiKey = process.env.ANTHROPIC_API_KEY
      process.env.ANTHROPIC_API_KEY = ''

      const errorMessage = 'File not found: /path/to/file.txt'
      const analysisResult = await analyzer.analyzeError(errorMessage)

      // Should return a structured analysis
      expect(result).toBeDefined()
      expect(result.rootCause).toBe('File or resource not found')
      expect(result.suggestedFixes).toEqual([
        'Verify file path exists and is accessible',
        'Check for typos in file paths'
      ])
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(1)

      // Restore API key
      process.env.ANTHROPIC_API_KEY = originalApiKey
    })

    test('should include stack trace in analysis', async () => {
      process.env.ANTHROPIC_API_KEY = ''

      const errorMessage = 'Module not found'
      const stackTrace = 'Error: Cannot find module\n    at require (internal/module.js)\n    at Object.<anonymous>'

      const analysisResult = await analyzer.analyzeError(errorMessage, stackTrace)

      expect(result).toBeDefined()
      // Both error and stack trace should influence analysis
      expect(result.rootCause).toBeDefined()
      expect(result.suggestedFixes.length).toBeGreaterThan(0)

      process.env.ANTHROPIC_API_KEY = ''
    })

    test('should handle API errors gracefully', async () => {
      process.env.ANTHROPIC_API_KEY = ''

      const errorMessage = 'Test error'

      // The mock should always return a valid response
      const analysisResult = await analyzer.analyzeError(errorMessage)

      expect(result).toBeDefined()
      expect(result.rootCause).not.toBe('Unable to analyze error')
    })
  })

  describe('Cache Key Generation', () => {
    test('should generate consistent hash for same input', async () => {
      const errorMessage = 'Duplicate error message'

      const hash1 = await analyzer.analyzeError(errorMessage)
      const hash2 = await analyzer.analyzeError(errorMessage)

      // Results should be the same (from cache)
      expect(hash1).toBeDefined()
      expect(hash2).toBeDefined()
      expect(hash1.rootCause).toBe(hash2.rootCause)
    })

    test('should generate different hashes for different errors', async () => {
      const error1 = 'First error'
      const error2 = 'Second error'

      const result1 = await analyzer.analyzeError(error1)
      const result2 = await analyzer.analyzeError(error2)

      expect(result1.rootCause).not.toBe(result2.rootCause)
    })
  })

  describe('Graceful Degradation', () => {
    test('should return null when throttled', async () => {
      const analyzer = new LLMAnalyzer({
        cacheDir: TEST_DIR,
        maxCallsPerSession: 0, // Immediately throttle
        cooldownMs: 0,
      })

      const analysisResult = await analyzer.analyzeError('Test error')
      expect(result).toBeNull()
    })
  })
})

describe('createLLMAnalyzer', () => {
  test('should be a function', () => {
    expect(typeof createLLMAnalyzer).toBe('function')
  })

  test('should create instance without throwing', () => {
    expect(() => createLLMAnalyzer()).not.toThrow()
  })

  test('should create instance with default options', () => {
    const instance = createLLMAnalyzer()
    expect(instance).toBeInstanceOf(LLMAnalyzer)
  })

  test('should create instance with custom options', () => {
    const instance = createLLMAnalyzer({
      cacheDir: '/custom/path',
      maxCallsPerSession: 20,
      cooldownMs: 120000,
    })
    expect(instance).toBeInstanceOf(LLMAnalyzer)
  })
})
