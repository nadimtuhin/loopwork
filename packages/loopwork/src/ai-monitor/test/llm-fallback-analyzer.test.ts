import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import fs from 'fs/promises'
import path from 'path'
import { LLMFallbackAnalyzer } from '../llm-fallback-analyzer'

const TEST_DIR = path.join(process.cwd(), '.test-llm-cache')
const MOCK_API_KEY = 'sk-ant-test-key'

describe('LLMFallbackAnalyzer', () => {
  let analyzer: LLMFallbackAnalyzer

  beforeEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true })
      await fs.mkdir(TEST_DIR, { recursive: true })
    } catch (e) {
    }

    analyzer = new LLMFallbackAnalyzer({
      apiKey: MOCK_API_KEY,
      model: 'claude-3-haiku-20240307',
      maxCallsPerSession: 10,
      cooldownMs: 0,
      cacheEnabled: true,
      cacheTTL: 86400000,
      timeout: 30000,
      cachePath: path.join(TEST_DIR, 'llm-cache.json'),
      sessionPath: path.join(TEST_DIR, 'llm-session.json'),
      useMock: true,
    })
  })

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true })
    } catch (e) {
    }
  })

  describe('Initialization', () => {
    test('should initialize successfully with valid config', () => {
      expect(analyzer).toBeDefined()
    })

    test('should initialize gracefully without API key', async () => {
      const noKeyAnalyzer = new LLMFallbackAnalyzer({
        apiKey: '',
        cacheEnabled: false,
      })

      const result = await noKeyAnalyzer.analyzeError('Test error')
      expect(result).toBeNull()
    })
  })

  describe('Session Management', () => {
    test('should track session statistics correctly', () => {
      const stats = analyzer.getSessionStats()

      expect(stats.callsThisSession).toBe(0)
      expect(stats.callsRemaining).toBe(10)
      expect(stats.lastCallTime).toBe(0)
      expect(stats.cooldownRemaining).toBe(0)
    })

    test('should reset session state on resetSession()', () => {
      analyzer.resetSession()

      const stats = analyzer.getSessionStats()

      expect(stats.callsThisSession).toBe(0)
      expect(stats.callsRemaining).toBe(10)
      expect(stats.cooldownRemaining).toBe(0)
    })

    test('should persist session state across instances', async () => {
      await analyzer.analyzeError('Test error 1')
      const stats1 = analyzer.getSessionStats()
      expect(stats1.callsThisSession).toBe(1)

      const analyzer2 = new LLMFallbackAnalyzer({
        apiKey: MOCK_API_KEY,
        cacheEnabled: true,
        cachePath: path.join(TEST_DIR, 'llm-cache.json'),
        sessionPath: path.join(TEST_DIR, 'llm-session.json'),
        useMock: true,
        cooldownMs: 0,
      })

      await analyzer2.analyzeError('Test error 2')

      const stats2 = analyzer2.getSessionStats()
      expect(stats2.callsThisSession).toBe(2)
    })
  })

  describe('Rate Limiting', () => {
    test('should block calls when max calls per session reached', async () => {
      const testDir = path.join(TEST_DIR, 'rate-limit-test')
      await fs.mkdir(testDir, { recursive: true })

      const limitedAnalyzer = new LLMFallbackAnalyzer({
        apiKey: MOCK_API_KEY,
        maxCallsPerSession: 3,
        cooldownMs: 0,
        cacheEnabled: false,
        useMock: true,
        sessionPath: path.join(testDir, 'llm-session.json'),
      })

      // Make 3 calls (should succeed)
      const result1 = await limitedAnalyzer.analyzeError('Error 1')
      expect(result1).not.toBeNull()

      const result2 = await limitedAnalyzer.analyzeError('Error 2')
      expect(result2).not.toBeNull()

      const result3 = await limitedAnalyzer.analyzeError('Error 3')
      expect(result3).not.toBeNull()

      // 4th call should be blocked
      const result4 = await limitedAnalyzer.analyzeError('Error 4')
      expect(result4).toBeNull()

      const stats = limitedAnalyzer.getSessionStats()
      expect(stats.callsThisSession).toBe(3)
      expect(stats.callsRemaining).toBe(0)
    })

    test('should enforce cooldown period between calls', async () => {
      const testDir = path.join(TEST_DIR, 'cooldown-test')
      await fs.mkdir(testDir, { recursive: true })

      const cooldownAnalyzer = new LLMFallbackAnalyzer({
        apiKey: MOCK_API_KEY,
        maxCallsPerSession: 10,
        cooldownMs: 1000, // 1 second cooldown
        cacheEnabled: false,
        useMock: true,
        sessionPath: path.join(testDir, 'llm-session.json'),
      })

      // First call
      const result1 = await cooldownAnalyzer.analyzeError('Error 1')
      expect(result1).not.toBeNull()

      // Immediate second call should be blocked by cooldown
      const result2 = await cooldownAnalyzer.analyzeError('Error 2')
      expect(result2).toBeNull()

      const stats = cooldownAnalyzer.getSessionStats()
      expect(stats.cooldownRemaining).toBeGreaterThan(0)
    })

    test('should allow calls after cooldown expires', async () => {
      const testDir = path.join(TEST_DIR, 'cooldown-expire-test')
      await fs.mkdir(testDir, { recursive: true })

      const cooldownAnalyzer = new LLMFallbackAnalyzer({
        apiKey: MOCK_API_KEY,
        maxCallsPerSession: 10,
        cooldownMs: 50, // Short cooldown for testing
        cacheEnabled: false,
        useMock: true,
        sessionPath: path.join(testDir, 'llm-session.json'),
      })

      // First call
      await cooldownAnalyzer.analyzeError('Error 1')

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 100))

      // Should be able to call again
      const result = await cooldownAnalyzer.analyzeError('Error 2')
      expect(result).not.toBeNull()
    })
  })

  describe('Cache Statistics', () => {
    test('should provide cache statistics', () => {
      const cacheStats = analyzer.getCacheStats()

      expect(cacheStats.size).toBe(0)
      expect(cacheStats.enabled).toBe(true)
      expect(cacheStats.ttl).toBe(86400000)
    })

    test('should return cache size of 0 initially', () => {
      const cacheStats = analyzer.getCacheStats()

      expect(cacheStats.size).toBe(0)
    })
  })

  describe('Cache Clearing', () => {
    test('should clear in-memory cache', async () => {
      const result = await analyzer.analyzeError('Test error')

      let cacheStats = analyzer.getCacheStats()
      const initialSize = cacheStats.size

      await analyzer.clearCache()

      cacheStats = analyzer.getCacheStats()
      expect(cacheStats.size).toBe(0)

      if (result !== null) {
        expect(initialSize).toBeGreaterThan(0)
      }
    })

    test('should delete cache file on clear', async () => {
      const cacheFile = path.join(TEST_DIR, 'llm-cache.json')

      await analyzer.analyzeError('Test error')

      let fileExists = false
      try {
        await fs.access(cacheFile)
        fileExists = true
      } catch (e) {
      }
      expect(fileExists).toBe(true)

      await analyzer.clearCache()

      fileExists = false
      try {
        await fs.access(cacheFile)
        fileExists = true
      } catch (e) {
      }
      expect(fileExists).toBe(false)
    })
  })

  describe('Error Handling Edge Cases', () => {
    test('should handle empty error strings', async () => {
      const result = await analyzer.analyzeError('')

      expect(result).not.toBeNull()
    })

    test('should handle very long error messages', async () => {
      const longError = 'Error: '.repeat(1000) + ' Something went very wrong'

      const result = await analyzer.analyzeError(longError)

      expect(result).not.toBeNull()
    })

    test('should handle special characters in errors', async () => {
      const errorWithSpecialChars = 'Error: \n\t\r Special chars: "<>&\'"'

      const result = await analyzer.analyzeError(errorWithSpecialChars)

      expect(result).not.toBeNull()
    })
  })
})
