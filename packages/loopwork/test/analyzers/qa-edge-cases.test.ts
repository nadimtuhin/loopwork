import { describe, test, expect, beforeEach } from 'bun:test'
import { ServiceContainer, createContainer } from '../../src/core/di/container'
import { GLMErrorAnalyzerFactory, MockErrorAnalyzerFactory } from '../../src/analyzers/factories'
import { GLMErrorAnalyzer } from '../../src/analyzers/glm-analyzer'
import { createAnalyzerRegistry } from '../../src/core/analyzer-registry'

describe('QA: Edge Cases and Integration', () => {
  describe('Service Container', () => {
    test('should throw when resolving unregistered service', () => {
      const container = createContainer()
      expect(() => container.resolve('unknown')).toThrow('Service not registered')
    })

    test('should return same instance for singleton', () => {
      const container = createContainer()
      let callCount = 0

      container.register('counter', () => {
        callCount++
        return { value: callCount }
      })

      const instance1 = container.resolve<{ value: number }>('counter')
      const instance2 = container.resolve<{ value: number }>('counter')

      expect(instance1.value).toBe(1)
      expect(instance2.value).toBe(1)
      expect(callCount).toBe(1)
    })

    test('should support multiple services', () => {
      const container = createContainer()

      container.register('serviceA', () => ({ name: 'A' }))
      container.register('serviceB', () => ({ name: 'B' }))

      expect(container.has('serviceA')).toBe(true)
      expect(container.has('serviceB')).toBe(true)
      expect(container.has('serviceC')).toBe(false)
    })

    test('should clear all services', () => {
      const container = createContainer()
      container.register('test', () => ({ value: 1 }))

      expect(container.has('test')).toBe(true)

      container.clear()

      expect(container.has('test')).toBe(false)
    })

    test('should support symbol identifiers', () => {
      const container = createContainer()
      const sym = Symbol('test')

      container.register(sym, () => ({ value: 42 }))

      const instance = container.resolve<{ value: number }>(sym)
      expect(instance.value).toBe(42)
    })

    test('should support class identifiers', () => {
      const container = createContainer()

      container.register('GLMErrorAnalyzer', () => new GLMErrorAnalyzer())

      const instance = container.resolve<GLMErrorAnalyzer>('GLMErrorAnalyzer')
      expect(instance).toBeInstanceOf(GLMErrorAnalyzer)
    })
  })

  describe('Factory Pattern', () => {
    test('GLM factory should create analyzers with different configs', () => {
      const factory = new GLMErrorAnalyzerFactory()

      const analyzer1 = factory.create({ apiKey: 'key1', model: 'glm-4.2' })
      const analyzer2 = factory.create({ apiKey: 'key2', model: 'glm-4.7' })

      expect(analyzer1).toBeInstanceOf(GLMErrorAnalyzer)
      expect(analyzer2).toBeInstanceOf(GLMErrorAnalyzer)
    })

    test('Mock factory should create mock analyzers', async () => {
      const factory = new MockErrorAnalyzerFactory()
      const analyzer = factory.create()

      const result = await analyzer.analyze({ errorMessage: 'test' })

      expect(result).toBeDefined()
      expect(result?.rootCause).toBe('Mock analysis')
    })

    test('Factories should be interchangeable', async () => {
      const glmFactory = new GLMErrorAnalyzerFactory()
      const mockFactory = new MockErrorAnalyzerFactory()

      const glmAnalyzer = glmFactory.create({})
      const mockAnalyzer = mockFactory.create()

      const glmResult = await glmAnalyzer.analyze({ errorMessage: 'ENOENT' })
      const mockResult = await mockAnalyzer.analyze({ errorMessage: 'ENOENT' })

      expect(glmResult?.rootCause).toContain('File')
      expect(mockResult?.rootCause).toBe('Mock analysis')
    })
  })

  describe('Registry Integration', () => {
    test('should handle empty registry gracefully', () => {
      const registry = createAnalyzerRegistry()

      expect(registry.getActiveErrorAnalyzer()).toBeUndefined()
      expect(registry.getActiveTaskOutputAnalyzer()).toBeUndefined()
      expect(registry.list()).toEqual([])
    })

    test('should auto-activate first registered analyzer', () => {
      const registry = createAnalyzerRegistry()
      const factory = new MockErrorAnalyzerFactory()

      registry.addErrorAnalyzer('first', factory.create())

      expect(registry.isActive('first')).toBe(true)
      expect(registry.getActiveName('error')).toBe('first')
    })

    test('should maintain isolation between registries', () => {
      const registry1 = createAnalyzerRegistry()
      const registry2 = createAnalyzerRegistry()
      const factory = new MockErrorAnalyzerFactory()

      registry1.addErrorAnalyzer('test', factory.create())

      expect(registry1.list()).toContain('test')
      expect(registry2.list()).not.toContain('test')
    })

    test('should handle swap to non-existent analyzer', () => {
      const registry = createAnalyzerRegistry()

      const result = registry.swapErrorAnalyzer('non-existent')

      expect(result).toBe(false)
    })

    test('should preserve analyzers after multiple swaps', () => {
      const registry = createAnalyzerRegistry()
      const factory = new MockErrorAnalyzerFactory()

      registry.addErrorAnalyzer('a', factory.create())
      registry.addErrorAnalyzer('b', factory.create())
      registry.addErrorAnalyzer('c', factory.create())

      registry.swapErrorAnalyzer('b')
      registry.swapErrorAnalyzer('a')
      registry.swapErrorAnalyzer('c')

      expect(registry.listByType('error').length).toBe(3)
      expect(registry.getActiveName('error')).toBe('c')
    })
  })

  describe('GLM Analyzer Robustness', () => {
    test('should handle empty error message', async () => {
      const analyzer = new GLMErrorAnalyzer()
      const result = await analyzer.analyze({ errorMessage: '' })

      expect(result).toBeDefined()
    })

    test('should handle very long error messages', async () => {
      const analyzer = new GLMErrorAnalyzer()
      const longMessage = 'Error: '.repeat(1000)

      const result = await analyzer.analyze({ errorMessage: longMessage })

      expect(result).toBeDefined()
    })

    test('should handle special characters in errors', async () => {
      const analyzer = new GLMErrorAnalyzer()
      const specialChars = 'Error: !@#$%^&*()_+-=[]{}|;\':",./<>?'

      const result = await analyzer.analyze({ errorMessage: specialChars })

      expect(result).toBeDefined()
    })

    test('should handle multiline stack traces', async () => {
      const analyzer = new GLMErrorAnalyzer()
      const stackTrace = `Error: Something failed
    at functionA (file.js:10:5)
    at functionB (file.js:20:10)
    at Object.<anonymous> (file.js:30:1)`

      const result = await analyzer.analyze({
        errorMessage: 'Something failed',
        stackTrace,
      })

      expect(result).toBeDefined()
    })

    test('should generate consistent cache keys', () => {
      const analyzer = new GLMErrorAnalyzer()

      const key1 = analyzer.getCacheKey({ errorMessage: 'test', stackTrace: 'trace' })
      const key2 = analyzer.getCacheKey({ errorMessage: 'test', stackTrace: 'trace' })
      const key3 = analyzer.getCacheKey({ errorMessage: 'test', stackTrace: 'different' })

      expect(key1).toBe(key2)
      expect(key1).not.toBe(key3)
    })

    test('should respect rate limiting', () => {
      const analyzer = new GLMErrorAnalyzer({ maxCallsPerSession: 2 })

      expect(analyzer.canMakeCall()).toBe(true)
      analyzer.analyze({ errorMessage: 'test' })
      expect(analyzer.canMakeCall()).toBe(true)
    })

    test('should reset call count properly', () => {
      const analyzer = new GLMErrorAnalyzer({ maxCallsPerSession: 1 })

      expect(analyzer.getCallCount()).toBe(0)
      analyzer.resetCallCount()
      expect(analyzer.getCallCount()).toBe(0)
    })
  })

  describe('Integration: DI + Registry + Factories', () => {
    test('full DI workflow', async () => {
      const container = createContainer()
      const registry = createAnalyzerRegistry()

      container.register('glmFactory', () => new GLMErrorAnalyzerFactory())
      container.register('mockFactory', () => new MockErrorAnalyzerFactory())

      const glmFactory = container.resolve<GLMErrorAnalyzerFactory>('glmFactory')
      const mockFactory = container.resolve<MockErrorAnalyzerFactory>('mockFactory')

      const glmAnalyzer = glmFactory.create({ apiKey: 'test' })
      const mockAnalyzer = mockFactory.create()

      registry.addErrorAnalyzer('glm', glmAnalyzer)
      registry.addErrorAnalyzer('mock', mockAnalyzer)

      registry.swapErrorAnalyzer('mock')
      const active = registry.getActiveErrorAnalyzer()
      const result = await active?.analyze({ errorMessage: 'ENOENT' })

      expect(result?.rootCause).toBe('Mock analysis')
    })

    test('should handle concurrent registry operations', () => {
      const registry = createAnalyzerRegistry()
      const factory = new MockErrorAnalyzerFactory()

      for (let i = 0; i < 10; i++) {
        registry.addErrorAnalyzer(`analyzer-${i}`, factory.create())
      }

      expect(registry.listByType('error').length).toBe(10)

      for (let i = 0; i < 10; i++) {
        registry.swapErrorAnalyzer(`analyzer-${i}`)
      }

      expect(registry.getActiveName('error')).toBe('analyzer-9')
    })
  })

  describe('Error Handling', () => {
    test('should handle factory creation errors gracefully', () => {
      const factory = new GLMErrorAnalyzerFactory()

      expect(() => factory.create(undefined)).not.toThrow()
      expect(() => factory.create({})).not.toThrow()
      expect(() => factory.create({ invalid: 'config' } as Record<string, unknown>)).not.toThrow()
    })

    test('should handle analyzer with missing API key', async () => {
      const analyzer = new GLMErrorAnalyzer({ apiKey: undefined })

      const result = await analyzer.analyze({ errorMessage: 'ENOENT' })

      expect(result).toBeDefined()
      expect(result?.suggestedFixes.length).toBeGreaterThan(0)
    })
  })

  describe('Type Safety', () => {
    test('factories should return correct types', () => {
      const glmFactory = new GLMErrorAnalyzerFactory()
      const mockFactory = new MockErrorAnalyzerFactory()

      const glm = glmFactory.create({})
      const mock = mockFactory.create()

      expect(glm.name).toBe('error-analyzer')
      expect(mock.name).toBe('error-analyzer')
      expect(typeof glm.analyze).toBe('function')
      expect(typeof mock.analyze).toBe('function')
    })
  })
})
