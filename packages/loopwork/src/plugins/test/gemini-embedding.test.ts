import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { GeminiEmbeddingProvider, GeminiEmbeddingConfig, createGeminiEmbeddingProvider } from '../gemini-embedding'

describe('gemini-embedding', () => {

  describe('GeminiEmbeddingProvider', () => {
    test('should instantiate without errors', () => {
      const instance = new GeminiEmbeddingProvider()
      expect(instance).toBeDefined()
      expect(instance).toBeInstanceOf(GeminiEmbeddingProvider)
    })

    test('should maintain instance identity', () => {
      const instance1 = new GeminiEmbeddingProvider()
      const instance2 = new GeminiEmbeddingProvider()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('GeminiEmbeddingConfig', () => {
    test('should be used as a type', () => {
      const config: GeminiEmbeddingConfig = { apiKey: 'test' }
      expect(config.apiKey).toBe('test')
    })
  })

  describe('createGeminiEmbeddingProvider', () => {
    test('should be a function', () => {
      expect(typeof createGeminiEmbeddingProvider).toBe('function')
    })

    test('should execute without throwing', () => {
      expect(() => createGeminiEmbeddingProvider()).not.toThrow()
    })
  })
})
