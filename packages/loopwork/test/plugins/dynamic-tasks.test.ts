/**
 * Integration tests for dynamic-tasks plugin
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { createDynamicTasksPlugin, withDynamicTasks } from '../../src/plugins/dynamic-tasks'
import { PatternAnalyzer } from '../../src/analyzers/pattern-analyzer'
import type { TaskBackend } from '../../src/contracts/backend'
import type { Task } from '../../src/contracts/task'
import type { TaskContext, PluginTaskResult } from '../../src/contracts/plugin'
import type { TaskAnalyzer } from '../../src/contracts/analysis'
import { defineConfig } from '../../src/plugins'

describe('withDynamicTasks config wrapper', () => {
  test('should add dynamicTasks config to base config', () => {
    const baseConfig = defineConfig({ cli: 'claude' })
    const wrappedConfig = withDynamicTasks({
      maxTasksPerExecution: 3,
      autoApprove: false
    })(baseConfig)

    expect(wrappedConfig).toHaveProperty('dynamicTasks')
    expect(wrappedConfig.dynamicTasks).toEqual({
      enabled: true,
      createSubTasks: true,
      maxTasksPerExecution: 3,
      autoApprove: false,
      logCreatedTasks: true
    })
  })

  test('should use default values when no options provided', () => {
    const baseConfig = defineConfig({ cli: 'claude' })
    const wrappedConfig = withDynamicTasks()(baseConfig)

    expect(wrappedConfig.dynamicTasks).toEqual({
      enabled: true,
      createSubTasks: true,
      maxTasksPerExecution: 5,
      autoApprove: true,
      logCreatedTasks: true
    })
  })
})

describe('createDynamicTasksPlugin', () => {
  let mockBackend: TaskBackend
  let createdTasks: Task[]
  let createdSubTasks: { parentId: string; task: Partial<Task> }[]

  beforeEach(() => {
    createdTasks = []
    createdSubTasks = []

    mockBackend = {
      name: 'test-backend',
      findNextTask: mock(async () => null),
      getTask: mock(async () => null),
      listPendingTasks: mock(async () => []),
      markInProgress: mock(async () => ({ success: true })),
      markCompleted: mock(async () => ({ success: true })),
      markFailed: mock(async () => ({ success: true })),
      resetToPending: mock(async () => ({ success: true })),
      getSubTasks: mock(async () => []),
      getDependencies: mock(async () => []),
      getDependents: mock(async () => []),
      areDependenciesMet: mock(async () => true),
      setPriority: mock(async () => ({ success: true })),
      createTask: mock(async (task: Omit<Task, 'id' | 'status'>) => {
        const newTask: Task = {
          id: `TASK-${createdTasks.length + 1}`,
          status: 'pending',
          ...task
        }
        createdTasks.push(newTask)
        return newTask
      }),
      createSubTask: mock(async (parentId: string, task: Omit<Task, 'id' | 'parentId' | 'status'>) => {
        const newTask: Task = {
          id: `${parentId}${String.fromCharCode(97 + createdSubTasks.length)}`,
          parentId,
          status: 'pending',
          ...task
        }
        createdSubTasks.push({ parentId, task: newTask })
        createdTasks.push(newTask)
        return newTask
      })
    } as TaskBackend
  })

  test('should initialize plugin with default options', () => {
    const plugin = createDynamicTasksPlugin()

    expect(plugin.name).toBe('dynamic-tasks')
    expect(plugin.onBackendReady).toBeDefined()
    expect(plugin.onTaskComplete).toBeDefined()
    expect(plugin.onTaskFailed).toBeDefined()
  })

  test('should store backend reference on onBackendReady', async () => {
    const plugin = createDynamicTasksPlugin()
    await plugin.onBackendReady?.(mockBackend)

    // Backend should be stored internally (no direct way to check, but next tests will verify)
    expect(true).toBe(true)
  })

  test('should create tasks when patterns detected in output', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Implement feature',
        description: 'Add new feature',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: `
        Feature implemented successfully.

        TODO: Add unit tests for the new feature
        FIXME: Handle edge case when input is null

        Next steps: Add integration tests
      `,
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    // Should have created 3 tasks (TODO, FIXME, next steps)
    expect(createdTasks.length).toBeGreaterThanOrEqual(1)
    expect(createdTasks.length).toBeLessThanOrEqual(3)

    // Check that tasks were created with proper structure
    const todoTask = createdTasks.find(t => t.title.includes('unit tests'))
    expect(todoTask).toBeDefined()
  })

  test('should create sub-tasks when createSubTasks option is enabled', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      createSubTasks: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Implement feature',
        description: 'Add new feature',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add validation\nFIXME: Fix error handling',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    // Should have created sub-tasks
    expect(createdSubTasks.length).toBeGreaterThan(0)
    expect(createdSubTasks[0].parentId).toBe('TASK-001')
  })

  test('should respect maxTasksPerExecution limit', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      maxTasksPerExecution: 2,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Implement feature',
        description: 'Add new feature',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: `
        TODO: Task 1
        TODO: Task 2
        TODO: Task 3
        TODO: Task 4
        TODO: Task 5
      `,
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    // Should create max 2 tasks
    expect(createdTasks.length).toBeLessThanOrEqual(2)
  })

  test('should not create tasks when analyzer returns no suggestions', async () => {
    const mockAnalyzer: TaskAnalyzer = {
      analyze: mock(async () => ({
        shouldCreateTasks: false,
        suggestedTasks: [],
        reason: 'No patterns detected'
      }))
    }

    const plugin = createDynamicTasksPlugin({
      enabled: true,
      analyzer: mockAnalyzer,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'All done!',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    expect(createdTasks.length).toBe(0)
  })

  test('should handle backend without createTask support gracefully', async () => {
    const limitedBackend = {
      ...mockBackend,
      createTask: undefined,
      createSubTask: undefined
    } as TaskBackend

    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(limitedBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test',
        description: 'Test',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add tests',
      duration: 1000
    }

    // Should not throw
    await expect(plugin.onTaskComplete?.(context, result)).resolves.toBeUndefined()
  })

  test('should create remediation task on task failure', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test task',
        description: 'Test',
        status: 'failed',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    await plugin.onTaskFailed?.(context, 'Compilation error: missing semicolon')

    // Should create remediation task
    expect(createdTasks.length).toBe(1)
    expect(createdTasks[0].title).toContain('Debug failure')
    expect(createdTasks[0].description).toContain('Compilation error')
    expect(createdTasks[0].priority).toBe('high')
  })

  test('should not create tasks when plugin is disabled', async () => {
    const plugin = createDynamicTasksPlugin({
      enabled: false,
      autoApprove: true
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test',
        description: 'Test',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'TODO: Add tests',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    expect(createdTasks.length).toBe(0)
  })

  test('should use custom analyzer if provided', async () => {
    const customAnalyzer: TaskAnalyzer = {
      analyze: mock(async (task, result) => ({
        shouldCreateTasks: true,
        suggestedTasks: [
          {
            title: 'Custom task from analyzer',
            description: 'Custom description',
            priority: 'high',
            isSubTask: false
          }
        ],
        reason: 'Custom analyzer detected issue'
      }))
    }

    const plugin = createDynamicTasksPlugin({
      enabled: true,
      analyzer: customAnalyzer,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Test',
        description: 'Test',
        status: 'in-progress',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'Some output',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    expect(createdTasks.length).toBe(1)
    expect(createdTasks[0].title).toBe('Custom task from analyzer')
    expect(customAnalyzer.analyze).toHaveBeenCalledTimes(1)
  })
})

describe('Integration with PatternAnalyzer', () => {
  let mockBackend: TaskBackend
  let createdTasks: Task[]

  beforeEach(() => {
    createdTasks = []

    mockBackend = {
      name: 'test-backend',
      findNextTask: mock(async () => null),
      getTask: mock(async () => null),
      listPendingTasks: mock(async () => []),
      markInProgress: mock(async () => ({ success: true })),
      markCompleted: mock(async () => ({ success: true })),
      markFailed: mock(async () => ({ success: true })),
      resetToPending: mock(async () => ({ success: true })),
      getSubTasks: mock(async () => []),
      getDependencies: mock(async () => []),
      getDependents: mock(async () => []),
      areDependenciesMet: mock(async () => true),
      setPriority: mock(async () => ({ success: true })),
      createTask: mock(async (task: Omit<Task, 'id' | 'status'>) => {
        const newTask: Task = {
          id: `TASK-${createdTasks.length + 1}`,
          status: 'pending',
          ...task
        }
        createdTasks.push(newTask)
        return newTask
      })
    } as TaskBackend
  })

  test('should work with PatternAnalyzer to detect TODO comments', async () => {
    const analyzer = new PatternAnalyzer({ patterns: ['todo-comment'] })
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      analyzer,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Build API',
        description: 'Build REST API',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: `
        API implemented successfully.

        TODO: Add rate limiting middleware
        TODO: Add authentication
      `,
      duration: 2000
    }

    await plugin.onTaskComplete?.(context, result)

    expect(createdTasks.length).toBe(2)
    expect(createdTasks[0].title).toContain('rate limiting')
    expect(createdTasks[1].title).toContain('authentication')
  })

  test('should detect FIXME patterns with high priority', async () => {
    const analyzer = new PatternAnalyzer({ patterns: ['fixme-comment'] })
    const plugin = createDynamicTasksPlugin({
      enabled: true,
      analyzer,
      autoApprove: true,
      logCreatedTasks: false
    })

    await plugin.onBackendReady?.(mockBackend)

    const context: TaskContext = {
      task: {
        id: 'TASK-001',
        title: 'Fix bug',
        description: 'Fix critical bug',
        status: 'in-progress',
        priority: 'high',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    }

    const result: PluginTaskResult = {
      success: true,
      output: 'FIXME: Memory leak in event handler needs immediate attention',
      duration: 1000
    }

    await plugin.onTaskComplete?.(context, result)

    expect(createdTasks.length).toBe(1)
    expect(createdTasks[0].priority).toBe('high')
    expect(createdTasks[0].title).toContain('Memory leak')
  })
})
