import { describe, test, expect, beforeEach } from 'bun:test'
import type { IErrorAnalyzer, ITaskOutputAnalyzer } from '../../src/contracts/llm-analyzer'
import { createAnalyzerRegistry } from '../../src/core/analyzer-registry'

describe('Analyzer Swapping Without Removal', () => {
  let registry: ReturnType<typeof createAnalyzerRegistry>

  beforeEach(() => {
    registry = createAnalyzerRegistry()
  })

  describe('Multiple Error Analyzers', () => {
    test('should keep all analyzers when swapping', () => {
      const analyzer1: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({ rootCause: 'A1', suggestedFixes: [], confidence: 0.5 }),
        getCacheKey: () => 'k1',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const analyzer2: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({ rootCause: 'A2', suggestedFixes: [], confidence: 0.9 }),
        getCacheKey: () => 'k2',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const analyzer3: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({ rootCause: 'A3', suggestedFixes: [], confidence: 0.7 }),
        getCacheKey: () => 'k3',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      registry.register('analyzer-1', analyzer1)
      registry.register('analyzer-2', analyzer2)
      registry.register('analyzer-3', analyzer3)

      expect(registry.listByType('error').length).toBe(3)

      registry.setActiveErrorAnalyzer('analyzer-1')
      expect(registry.getActiveErrorAnalyzer()?.analyze).toBe(analyzer1.analyze)

      registry.setActiveErrorAnalyzer('analyzer-2')
      expect(registry.getActiveErrorAnalyzer()?.analyze).toBe(analyzer2.analyze)

      registry.setActiveErrorAnalyzer('analyzer-3')
      expect(registry.getActiveErrorAnalyzer()?.analyze).toBe(analyzer3.analyze)

      expect(registry.listByType('error').length).toBe(3)
    })

    test('should swap and return previous analyzer', async () => {
      const productionAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({ rootCause: 'Production', suggestedFixes: [], confidence: 0.9 }),
        getCacheKey: () => 'prod',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const debugAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({ rootCause: 'Debug', suggestedFixes: [], confidence: 0.5 }),
        getCacheKey: () => 'debug',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      registry.addErrorAnalyzer('production', productionAnalyzer)
      expect(registry.getActiveName('error')).toBe('production')

      registry.addErrorAnalyzer('debug', debugAnalyzer)
      expect(registry.listByType('error').length).toBe(2)

      const result = registry.swapErrorAnalyzer('debug')
      expect(result).toBe(true)
      expect(registry.getActiveName('error')).toBe('debug')

      const activeResult = await registry.getActiveErrorAnalyzer()?.analyze({ errorMessage: 'test' })
      expect(activeResult?.rootCause).toBe('Debug')

      registry.swapErrorAnalyzer('production')
      const prodResult = await registry.getActiveErrorAnalyzer()?.analyze({ errorMessage: 'test' })
      expect(prodResult?.rootCause).toBe('Production')
    })

    test('should list all analyzers with active status', () => {
      const a1: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const a2: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      registry.addErrorAnalyzer('first', a1)
      registry.addErrorAnalyzer('second', a2)
      registry.setActiveErrorAnalyzer('second')

      const all = registry.getAllErrorAnalyzers()
      expect(all.length).toBe(2)
      expect(all.map((a) => a.name)).toContain('first')
      expect(all.map((a) => a.name)).toContain('second')
    })
  })

  describe('Multiple Task Output Analyzers', () => {
    test('should swap without removing previous analyzers', () => {
      const analyzer1: ITaskOutputAnalyzer = {
        name: 'task-output-analyzer',
        fallbackToPattern: true,
        analyze: async () => ({ shouldCreateTasks: true, suggestedTasks: [], reason: 'A1' }),
        getCacheKey: () => 'k1',
        clearCache: () => {},
        getCacheSize: () => 0,
      }

      const analyzer2: ITaskOutputAnalyzer = {
        name: 'task-output-analyzer',
        fallbackToPattern: false,
        analyze: async () => ({ shouldCreateTasks: false, suggestedTasks: [], reason: 'A2' }),
        getCacheKey: () => 'k2',
        clearCache: () => {},
        getCacheSize: () => 0,
      }

      registry.addTaskOutputAnalyzer('pattern-based', analyzer1)
      registry.addTaskOutputAnalyzer('llm-only', analyzer2)

      expect(registry.listByType('task-output').length).toBe(2)

      registry.swapTaskOutputAnalyzer('pattern-based')
      expect(registry.getActiveTaskOutputAnalyzer()?.fallbackToPattern).toBe(true)

      registry.swapTaskOutputAnalyzer('llm-only')
      expect(registry.getActiveTaskOutputAnalyzer()?.fallbackToPattern).toBe(false)

      expect(registry.listByType('task-output').length).toBe(2)
    })
  })

  describe('Registry Statistics', () => {
    test('should report correct stats', () => {
      const e1: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const e2: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const t1: ITaskOutputAnalyzer = {
        name: 'task-output-analyzer',
        fallbackToPattern: true,
        analyze: async () => ({ shouldCreateTasks: false, suggestedTasks: [], reason: '' }),
        getCacheKey: () => '',
        clearCache: () => {},
        getCacheSize: () => 0,
      }

      registry.addErrorAnalyzer('e1', e1)
      registry.addErrorAnalyzer('e2', e2)
      registry.addTaskOutputAnalyzer('t1', t1)

      const stats = registry.getStats()
      expect(stats.total).toBe(3)
      expect(stats.errorAnalyzers).toBe(2)
      expect(stats.taskOutputAnalyzers).toBe(1)
      expect(stats.activeError).toBeDefined()
      expect(stats.activeTaskOutput).toBeDefined()
    })
  })

  describe('IsActive Tracking', () => {
    test('should track which analyzer is active', () => {
      const a1: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const a2: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      registry.register('analyzer-1', a1)
      registry.register('analyzer-2', a2)

      expect(registry.isActive('analyzer-1')).toBe(true)
      expect(registry.isActive('analyzer-2')).toBe(false)

      registry.setActiveErrorAnalyzer('analyzer-2')

      expect(registry.isActive('analyzer-1')).toBe(false)
      expect(registry.isActive('analyzer-2')).toBe(true)
    })
  })
})
