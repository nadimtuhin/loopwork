import { describe, test, expect, beforeEach } from 'bun:test'
import type {
  IErrorAnalyzer,
  ITaskOutputAnalyzer,
  ErrorAnalysisRequest,
  ErrorAnalysisResponse,
  TaskOutputAnalysisRequest,
  TaskOutputAnalysisResponse,
} from '../../src/contracts/llm-analyzer'
import { analyzerRegistry, createAnalyzerRegistry } from '../../src/core/analyzer-registry'
import { LLMAnalyzer as TaskOutputAnalyzer } from '../../src/analyzers/llm-analyzer'

describe('Unified LLM Analyzer Interface', () => {
  beforeEach(() => {
    analyzerRegistry.clear()
  })

  describe('Analyzer Registry', () => {
    test('should register and retrieve error analyzer', () => {
      const mockErrorAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({
          rootCause: 'test',
          suggestedFixes: ['fix1'],
          confidence: 0.9,
        }),
        getCacheKey: (req) => req.errorMessage,
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      analyzerRegistry.setErrorAnalyzer(mockErrorAnalyzer)
      const retrieved = analyzerRegistry.getErrorAnalyzer()

      expect(retrieved).toBeDefined()
      expect(retrieved?.name).toBe('error-analyzer')
    })

    test('should register and retrieve task output analyzer', () => {
      const analyzer = new TaskOutputAnalyzer()
      analyzerRegistry.setTaskOutputAnalyzer(analyzer)
      const retrieved = analyzerRegistry.getTaskOutputAnalyzer()

      expect(retrieved).toBeDefined()
      expect(retrieved?.name).toBe('task-output-analyzer')
    })

    test('should list all registered analyzers', () => {
      const errorAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const taskAnalyzer = new TaskOutputAnalyzer()

      analyzerRegistry.register('my-error-analyzer', errorAnalyzer)
      analyzerRegistry.register('my-task-analyzer', taskAnalyzer)

      const list = analyzerRegistry.list()
      expect(list.length).toBe(2)
      expect(list).toContain('my-error-analyzer')
      expect(list).toContain('my-task-analyzer')
    })

    test('should create isolated registry instances', () => {
      const registry1 = createAnalyzerRegistry()
      const registry2 = createAnalyzerRegistry()

      const errorAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      registry1.setErrorAnalyzer(errorAnalyzer)

      expect(registry1.getErrorAnalyzer()).toBeDefined()
      expect(registry2.getErrorAnalyzer()).toBeUndefined()
    })

    test('should unregister analyzers', () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      analyzerRegistry.register('my-error-analyzer', analyzer)
      expect(analyzerRegistry.getErrorAnalyzer()).toBeDefined()

      const unregistered = analyzerRegistry.unregister('my-error-analyzer')
      expect(unregistered).toBe(true)
    })

    test('should clear all analyzers', () => {
      const errorAnalyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => '',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      analyzerRegistry.setErrorAnalyzer(errorAnalyzer)
      analyzerRegistry.setTaskOutputAnalyzer(new TaskOutputAnalyzer())

      analyzerRegistry.clear()

      expect(analyzerRegistry.getErrorAnalyzer()).toBeUndefined()
      expect(analyzerRegistry.getTaskOutputAnalyzer()).toBeUndefined()
      expect(analyzerRegistry.list().length).toBe(0)
    })
  })

  describe('Error Analyzer Interface Compliance', () => {
    test('should implement all required IErrorAnalyzer methods', () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({
          rootCause: 'test',
          suggestedFixes: ['fix'],
          confidence: 0.8,
        }),
        getCacheKey: (req) => req.errorMessage,
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 5,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 1000,
      }

      expect(analyzer.name).toBe('error-analyzer')
      expect(typeof analyzer.analyze).toBe('function')
      expect(typeof analyzer.getCacheKey).toBe('function')
      expect(typeof analyzer.clearCache).toBe('function')
      expect(typeof analyzer.canMakeCall).toBe('function')
      expect(typeof analyzer.getCallCount).toBe('function')
      expect(typeof analyzer.resetCallCount).toBe('function')
      expect(typeof analyzer.getTimeUntilNextCall).toBe('function')
    })

    test('should handle error analysis request', async () => {
      const mockResponse: ErrorAnalysisResponse = {
        rootCause: 'Test error',
        suggestedFixes: ['Fix 1', 'Fix 2'],
        confidence: 0.9,
      }

      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => mockResponse,
        getCacheKey: () => 'key',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const request: ErrorAnalysisRequest = {
        errorMessage: 'Something went wrong',
        stackTrace: 'at line 42',
      }

      const result = await analyzer.analyze(request)
      expect(result).toEqual(mockResponse)
    })

    test('should return null when throttled', async () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => 'key',
        clearCache: () => {},
        canMakeCall: () => false,
        getCallCount: () => 10,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 5000,
      }

      expect(analyzer.canMakeCall()).toBe(false)
      expect(analyzer.getCallCount()).toBe(10)
      expect(analyzer.getTimeUntilNextCall()).toBe(5000)
    })
  })

  describe('Task Output Analyzer Interface Compliance', () => {
    test('should implement all required ITaskOutputAnalyzer methods', () => {
      const analyzer = new TaskOutputAnalyzer()

      expect(analyzer.name).toBe('task-output-analyzer')
      expect(typeof analyzer.analyze).toBe('function')
      expect(typeof analyzer.getCacheKey).toBe('function')
      expect(typeof analyzer.clearCache).toBe('function')
      expect(typeof analyzer.getCacheSize).toBe('function')
    })

    test('should handle task output analysis request', async () => {
      const analyzer = new TaskOutputAnalyzer()

      const request: TaskOutputAnalysisRequest = {
        task: {
          id: 'TASK-001',
          title: 'Test Task',
          description: 'Test description',
          status: 'completed',
          priority: 'medium',
        },
        result: {
          success: true,
          duration: 1000,
          output: 'TODO: Add more tests',
        },
      }

      const result = await analyzer.analyze(request)

      expect(result).toBeDefined()
      expect(typeof result.shouldCreateTasks).toBe('boolean')
      expect(Array.isArray(result.suggestedTasks)).toBe(true)
      expect(typeof result.reason).toBe('string')
    })

    test('should use fallbackToPattern property', () => {
      const analyzer1 = new TaskOutputAnalyzer({ fallbackToPattern: true })
      const analyzer2 = new TaskOutputAnalyzer({ fallbackToPattern: false })

      expect(analyzer1.fallbackToPattern).toBe(true)
      expect(analyzer2.fallbackToPattern).toBe(false)
    })
  })

  describe('Swappable Implementations', () => {
    test('should allow swapping error analyzers at runtime', async () => {
      const analyzer1: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({
          rootCause: 'Analyzer 1',
          suggestedFixes: ['fix1'],
          confidence: 0.5,
        }),
        getCacheKey: () => 'key1',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 1,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const analyzer2: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => ({
          rootCause: 'Analyzer 2',
          suggestedFixes: ['fix2'],
          confidence: 0.9,
        }),
        getCacheKey: () => 'key2',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 2,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      analyzerRegistry.setErrorAnalyzer(analyzer1)
      const result1 = await analyzerRegistry.getErrorAnalyzer()?.analyze({
        errorMessage: 'test',
      })
      expect(result1?.rootCause).toBe('Analyzer 1')

      analyzerRegistry.setErrorAnalyzer(analyzer2)
      const result2 = await analyzerRegistry.getErrorAnalyzer()?.analyze({
        errorMessage: 'test',
      })
      expect(result2?.rootCause).toBe('Analyzer 2')
    })

    test('should allow swapping task output analyzers at runtime', async () => {
      const analyzer1 = new TaskOutputAnalyzer()
      const analyzer2 = new TaskOutputAnalyzer({ systemPrompt: 'Custom prompt' })

      analyzerRegistry.setTaskOutputAnalyzer(analyzer1)
      const retrieved1 = analyzerRegistry.getTaskOutputAnalyzer()
      expect(retrieved1).toBe(analyzer1)

      analyzerRegistry.setTaskOutputAnalyzer(analyzer2)
      const retrieved2 = analyzerRegistry.getTaskOutputAnalyzer()
      expect(retrieved2).toBe(analyzer2)
      expect(retrieved2).not.toBe(analyzer1)
    })
  })

  describe('Cache Operations', () => {
    test('should support cache clearing on error analyzers', () => {
      let cacheCleared = false

      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => 'key',
        clearCache: () => {
          cacheCleared = true
        },
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      analyzer.clearCache()
      expect(cacheCleared).toBe(true)
    })

    test('should support cache operations on task output analyzers', () => {
      const analyzer = new TaskOutputAnalyzer()

      expect(analyzer.getCacheSize()).toBe(0)
      analyzer.clearCache()
      expect(analyzer.getCacheSize()).toBe(0)
    })

    test('should generate consistent cache keys', () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: (req) => req.errorMessage,
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      const request1: ErrorAnalysisRequest = {
        errorMessage: 'Error A',
        stackTrace: 'trace',
      }

      const request2: ErrorAnalysisRequest = {
        errorMessage: 'Error A',
        stackTrace: 'trace',
      }

      const request3: ErrorAnalysisRequest = {
        errorMessage: 'Error B',
        stackTrace: 'trace',
      }

      expect(analyzer.getCacheKey(request1)).toBe(analyzer.getCacheKey(request2))
      expect(analyzer.getCacheKey(request1)).not.toBe(analyzer.getCacheKey(request3))
    })
  })

  describe('Error Handling', () => {
    test('should handle errors gracefully', async () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => {
          throw new Error('Analysis failed')
        },
        getCacheKey: () => 'key',
        clearCache: () => {},
        canMakeCall: () => true,
        getCallCount: () => 0,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => 0,
      }

      await expect(
        analyzer.analyze({ errorMessage: 'test' })
      ).rejects.toThrow('Analysis failed')
    })

    test('should return null for unknown errors when throttled', async () => {
      const analyzer: IErrorAnalyzer = {
        name: 'error-analyzer',
        analyze: async () => null,
        getCacheKey: () => 'key',
        clearCache: () => {},
        canMakeCall: () => false,
        getCallCount: () => 10,
        resetCallCount: () => {},
        getTimeUntilNextCall: () => Infinity,
      }

      const result = await analyzer.analyze({ errorMessage: 'unknown' })
      expect(result).toBeNull()
    })
  })
})
