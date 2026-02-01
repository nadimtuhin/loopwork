import { describe, test, expect, beforeEach } from 'bun:test'
import { GLMErrorAnalyzer, createGLMErrorAnalyzer } from '../../src/analyzers/glm-analyzer'
import { createAnalyzerRegistry } from '../../src/core/analyzer-registry'

describe('GLMErrorAnalyzer', () => {
  let analyzer: GLMErrorAnalyzer

  beforeEach(() => {
    analyzer = new GLMErrorAnalyzer()
  })

  describe('Constructor', () => {
    test('should create with default options', () => {
      expect(analyzer).toBeDefined()
      expect(analyzer.name).toBe('error-analyzer')
    })

    test('should use environment API key', () => {
      const originalKey = process.env.GLM_API_KEY
      process.env.GLM_API_KEY = 'test-key'
      
      const a = new GLMErrorAnalyzer()
      expect(a).toBeDefined()
      
      process.env.GLM_API_KEY = originalKey
    })

    test('should accept custom options', () => {
      const a = new GLMErrorAnalyzer({
        apiKey: 'custom-key',
        model: 'glm-4.2-flash',
        maxCallsPerSession: 5,
        cooldownMs: 1000,
      })
      expect(a).toBeDefined()
    })
  })

  describe('Pattern Matching', () => {
    test('should detect ENOENT errors', async () => {
      const result = await analyzer.analyze({
        errorMessage: 'ENOENT: no such file or directory',
      })

      expect(result).toBeDefined()
      expect(result?.rootCause).toContain('File')
      expect(result?.confidence).toBeGreaterThan(0.8)
    })

    test('should detect permission errors', async () => {
      const result = await analyzer.analyze({
        errorMessage: 'EACCES: permission denied',
      })

      expect(result).toBeDefined()
      expect(result?.rootCause).toContain('Permission')
    })

    test('should detect timeout errors', async () => {
      const result = await analyzer.analyze({
        errorMessage: 'ETIMEDOUT: connection timed out',
      })

      expect(result).toBeDefined()
      expect(result?.rootCause).toContain('timed out')
    })
  })

  describe('Fallback Analysis', () => {
    test('should provide fallback for unknown errors', async () => {
      const result = await analyzer.analyze({
        errorMessage: 'Some random unknown error',
      })

      expect(result).toBeDefined()
      expect(result?.suggestedFixes.length).toBeGreaterThan(0)
    })

    test('should detect syntax errors in fallback', async () => {
      const result = await analyzer.analyze({
        errorMessage: 'Unexpected syntax error in parsing',
      })

      expect(result?.rootCause).toContain('Syntax')
    })
  })

  describe('Rate Limiting', () => {
    test('should track call count', () => {
      expect(analyzer.getCallCount()).toBe(0)
    })

    test('should allow calls initially', () => {
      expect(analyzer.canMakeCall()).toBe(true)
    })

    test('should support reset', () => {
      analyzer.resetCallCount()
      expect(analyzer.getCallCount()).toBe(0)
      expect(analyzer.getTimeUntilNextCall()).toBe(0)
    })

    test('should throttle after max calls', () => {
      const limited = new GLMErrorAnalyzer({ maxCallsPerSession: 1 })
      limited.canMakeCall()
      expect(limited.canMakeCall()).toBe(true)
    })
  })

  describe('Cache Key Generation', () => {
    test('should generate consistent keys', () => {
      const key1 = analyzer.getCacheKey({ errorMessage: 'test error' })
      const key2 = analyzer.getCacheKey({ errorMessage: 'test error' })
      expect(key1).toBe(key2)
    })

    test('should include stack trace in key', () => {
      const key1 = analyzer.getCacheKey({ errorMessage: 'error', stackTrace: 'trace1' })
      const key2 = analyzer.getCacheKey({ errorMessage: 'error', stackTrace: 'trace2' })
      expect(key1).not.toBe(key2)
    })
  })

  describe('Factory Function', () => {
    test('createGLMErrorAnalyzer should create instance', () => {
      const a = createGLMErrorAnalyzer({ apiKey: 'test' })
      expect(a).toBeInstanceOf(GLMErrorAnalyzer)
      expect(a.name).toBe('error-analyzer')
    })
  })
})

describe('GLM Analyzer Registry Integration', () => {
  test('should register and swap GLM analyzer', () => {
    const registry = createAnalyzerRegistry()
    const glmAnalyzer = createGLMErrorAnalyzer()

    registry.addErrorAnalyzer('glm', glmAnalyzer)
    expect(registry.listByType('error')).toContain('glm')

    const success = registry.swapErrorAnalyzer('glm')
    expect(success).toBe(true)
    expect(registry.isActive('glm')).toBe(true)
  })

  test('should swap between Claude and GLM analyzers', async () => {
    const registry = createAnalyzerRegistry()

    const claudeAnalyzer = {
      name: 'error-analyzer' as const,
      analyze: async () => ({ rootCause: 'Claude analysis', suggestedFixes: [], confidence: 0.9 }),
      getCacheKey: () => 'key',
      clearCache: () => {},
      canMakeCall: () => true,
      getCallCount: () => 0,
      resetCallCount: () => {},
      getTimeUntilNextCall: () => 0,
    }

    const glmAnalyzer = createGLMErrorAnalyzer()

    registry.addErrorAnalyzer('claude', claudeAnalyzer)
    registry.addErrorAnalyzer('glm', glmAnalyzer)

    registry.swapErrorAnalyzer('claude')
    const claudeResult = await registry.getActiveErrorAnalyzer()?.analyze({ errorMessage: 'test' })
    expect(claudeResult?.rootCause).toBe('Claude analysis')

    registry.swapErrorAnalyzer('glm')
    const glmResult = await registry.getActiveErrorAnalyzer()?.analyze({ 
      errorMessage: 'ENOENT: file not found' 
    })
    expect(glmResult?.rootCause).toContain('File')

    expect(registry.listByType('error').length).toBe(2)
  })
})
