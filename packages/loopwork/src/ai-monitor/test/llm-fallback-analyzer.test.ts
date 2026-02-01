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
      await fs.unlink(path.join(TEST_DIR, 'llm-cache.json'))
    } catch (e) {
    }

    analyzer = new LLMFallbackAnalyzer({
      apiKey: MOCK_API_KEY,
      model: 'claude-3-haiku-20240307',
      maxCallsPerSession: 10,
      cooldownMs: 300000,
      cacheEnabled: true,
      cacheTTL: 86400000,
      timeout: 30000,
      cachePath: path.join(TEST_DIR, 'llm-cache.json'),
    })
  })

  afterEach(async () => {
    try {
      await fs.unlink(path.join(TEST_DIR, 'llm-cache.json'))
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

      expect(stats).toMatchObject({
        callsThisSession: expect.any(Number),
        callsRemaining: expect.any(Number),
        lastCallTime: expect.any(Number),
        cooldownRemaining: expect.any(Number),
      })

      expect(typeof stats.callsThisSession).toBe('number')
      expect(stats.callsThisSession).toBe(0)
      expect(typeof stats.callsRemaining).toBe('number')
      expect(stats.callsRemaining).toBe(10)
    })

    test('should reset session state on resetSession()', () => {
      analyzer.resetSession()

      const stats = analyzer.getSessionStats()

      expect(stats.callsThisSession).toBe(0)
      expect(stats.callsRemaining).toBe(10)
      expect(stats.cooldownRemaining).toBe(0)
    })
  })

  describe('Cache Statistics', () => {
    test('should provide cache statistics', () => {
      const cacheStats = analyzer.getCacheStats()

      expect(cacheStats).toMatchObject({
        size: expect.any(Number),
        ttl: expect.any(Number),
      })

      expect(typeof cacheStats.enabled).toBe('boolean')
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
