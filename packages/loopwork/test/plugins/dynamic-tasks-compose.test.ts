/**
 * Integration test for dynamic-tasks plugin with compose pattern
 */

import { describe, test, expect } from 'bun:test'
import { compose, defineConfig } from '../../src/plugins'
import { PatternAnalyzer } from '../../src/analyzers'

describe('withDynamicTasks compose integration', () => {
  test('should work with compose pattern', () => {
    const config = compose(
      withDynamicTasks({
        enabled: true,
        maxTasksPerExecution: 3,
        autoApprove: false
      })
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'test.json' },
      cli: 'claude'
    }))

    expect(config).toHaveProperty('dynamicTasks')
    expect(config.dynamicTasks).toEqual({
      enabled: true,
      createSubTasks: true,
      maxTasksPerExecution: 3,
      autoApprove: false,
      logCreatedTasks: true
    })
    expect(config.backend).toEqual({ type: 'json', tasksFile: 'test.json' })
    expect(config.cli).toBe('claude')
  })

  test('should work with custom analyzer', () => {
    const customAnalyzer = new PatternAnalyzer({
      patterns: ['todo-comment', 'fixme-comment']
    })

    const config = compose(
      withDynamicTasks({
        analyzer: customAnalyzer,
        createSubTasks: true
      })
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'test.json' },
      cli: 'claude'
    }))

    expect(config).toHaveProperty('dynamicTasks')
    expect(config.dynamicTasks.enabled).toBe(true)
    expect(config.dynamicTasks.createSubTasks).toBe(true)
  })

  test('should work with multiple plugins', () => {
    // Mock another wrapper for testing
    const withMockPlugin = (config: any) => ({
      ...config,
      mockPlugin: { enabled: true }
    })

    const config = compose(
      withMockPlugin,
      withDynamicTasks({
        maxTasksPerExecution: 5
      })
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'test.json' },
      cli: 'claude'
    }))

    expect(config).toHaveProperty('dynamicTasks')
    expect(config).toHaveProperty('mockPlugin')
    expect(config.dynamicTasks.maxTasksPerExecution).toBe(5)
    expect(config.mockPlugin.enabled).toBe(true)
  })

  test('should preserve base config when wrapping', () => {
    const baseConfig = defineConfig({
      backend: { type: 'json', tasksFile: 'test.json' },
      cli: 'claude',
      maxIterations: 100,
      timeout: 600,
      debug: true
    })

    const wrappedConfig = withDynamicTasks({
      enabled: true
    })(baseConfig)

    // Original config should be preserved
    expect(wrappedConfig.cli).toBe('claude')
    expect(wrappedConfig.maxIterations).toBe(100)
    expect(wrappedConfig.timeout).toBe(600)
    expect(wrappedConfig.debug).toBe(true)
    expect(wrappedConfig.backend).toEqual({ type: 'json', tasksFile: 'test.json' })

    // New config should be added
    expect(wrappedConfig.dynamicTasks).toBeDefined()
    expect(wrappedConfig.dynamicTasks.enabled).toBe(true)
  })

  test('should allow disabling plugin via options', () => {
    const config = compose(
      withDynamicTasks({
        enabled: false
      })
    )(defineConfig({
      backend: { type: 'json', tasksFile: 'test.json' },
      cli: 'claude'
    }))

    expect(config.dynamicTasks.enabled).toBe(false)
  })
})
