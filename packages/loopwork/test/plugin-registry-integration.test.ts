import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import { plugins } from '../src/plugins/index'
import { logger } from '../src/core/utils'
import type { LoopworkPlugin } from '../src/contracts'

/**
 * Integration tests for Plugin Registry
 *
 * Coverage target: src/plugins/index.ts (48.28% -> 65%+)
 */

describe('Plugin Registry Integration', () => {
  beforeEach(() => {
    plugins.clear()
  })

  afterEach(() => {
    plugins.clear()
  })

  describe('Plugin registration and management', () => {
    test('registers a single plugin', () => {
      const plugin: LoopworkPlugin = {
        name: 'test-plugin',
        async onConfigLoad(config) {
          return config
        }
      }

      plugins.register(plugin)
      const all = plugins.getAll()

      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('test-plugin')
    })

    test('registers multiple plugins', () => {
      const plugin1: LoopworkPlugin = { name: 'plugin-1' }
      const plugin2: LoopworkPlugin = { name: 'plugin-2' }
      const plugin3: LoopworkPlugin = { name: 'plugin-3' }

      plugins.register(plugin1)
      plugins.register(plugin2)
      plugins.register(plugin3)

      const all = plugins.getAll()
      expect(all).toHaveLength(3)
      expect(all.map(p => p.name)).toEqual(['plugin-1', 'plugin-2', 'plugin-3'])
    })

    test('replaces existing plugin with same name', () => {
      const plugin1: LoopworkPlugin = {
        name: 'my-plugin',
        async onTaskStart() {
          // v1 logic
        }
      }

      const plugin2: LoopworkPlugin = {
        name: 'my-plugin',
        async onTaskStart() {
          // v2 logic
        }
      }

      plugins.register(plugin1)
      expect(plugins.getAll()).toHaveLength(1)

      plugins.register(plugin2)
      expect(plugins.getAll()).toHaveLength(1) // Still 1, replaced

      const registered = plugins.get('my-plugin')
      expect(registered).toBe(plugin2) // Gets the newer one
    })

    test('unregisters a plugin by name', () => {
      const plugin1: LoopworkPlugin = { name: 'plugin-1' }
      const plugin2: LoopworkPlugin = { name: 'plugin-2' }

      plugins.register(plugin1)
      plugins.register(plugin2)
      expect(plugins.getAll()).toHaveLength(2)

      plugins.unregister('plugin-1')
      expect(plugins.getAll()).toHaveLength(1)
      expect(plugins.get('plugin-1')).toBeUndefined()
      expect(plugins.get('plugin-2')).toBeDefined()
    })

    test('get returns plugin by name', () => {
      const plugin: LoopworkPlugin = { name: 'target-plugin' }

      plugins.register(plugin)
      const found = plugins.get('target-plugin')

      expect(found).toBe(plugin)
    })

    test('get returns undefined for non-existent plugin', () => {
      const found = plugins.get('nonexistent')
      expect(found).toBeUndefined()
    })

    test('clear removes all plugins', () => {
      plugins.register({ name: 'plugin-1' })
      plugins.register({ name: 'plugin-2' })
      plugins.register({ name: 'plugin-3' })

      expect(plugins.getAll()).toHaveLength(3)

      plugins.clear()
      expect(plugins.getAll()).toHaveLength(0)
    })

    test('getAll returns copy of plugins array', () => {
      const plugin: LoopworkPlugin = { name: 'plugin-1' }
      plugins.register(plugin)

      const all1 = plugins.getAll()
      const all2 = plugins.getAll()

      // Should be different arrays (copies)
      expect(all1).not.toBe(all2)

      // But contain same plugins
      expect(all1[0]).toBe(all2[0])
    })
  })

  describe('Plugin hook execution', () => {
    test('runs onConfigLoad hook for all plugins', async () => {
      const executionLog: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'plugin-1',
        async onConfigLoad(config) {
          executionLog.push('plugin-1')
          return config
        }
      }

      const plugin2: LoopworkPlugin = {
        name: 'plugin-2',
        async onConfigLoad(config) {
          executionLog.push('plugin-2')
          return config
        }
      }

      const plugin3WithoutHook: LoopworkPlugin = {
        name: 'plugin-3'
        // No onConfigLoad hook
      }

      plugins.register(plugin1)
      plugins.register(plugin2)
      plugins.register(plugin3WithoutHook)

      const mockConfig = { cli: 'claude' as const }
      await plugins.runHook('onConfigLoad', mockConfig)

      expect(executionLog).toEqual(['plugin-1', 'plugin-2'])
    })

    test('runs onTaskStart hook for all plugins', async () => {
      const executionLog: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'plugin-1',
        async onTaskStart(task) {
          executionLog.push(`plugin-1:${task.id}`)
        }
      }

      const plugin2: LoopworkPlugin = {
        name: 'plugin-2',
        async onTaskStart(task) {
          executionLog.push(`plugin-2:${task.id}`)
        }
      }

      plugins.register(plugin1)
      plugins.register(plugin2)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
      await plugins.runHook('onTaskStart', mockTask)

      expect(executionLog).toEqual(['plugin-1:TASK-001', 'plugin-2:TASK-001'])
    })

    test('runs onTaskComplete hook for all plugins', async () => {
      const executionLog: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'plugin-1',
        async onTaskComplete(task) {
          executionLog.push(`complete:${task.id}`)
        }
      }

      plugins.register(plugin1)

      const mockTask = { id: 'TASK-001', status: 'completed' as const, priority: 'high' as const }
      await plugins.runHook('onTaskComplete', mockTask)

      expect(executionLog).toEqual(['complete:TASK-001'])
    })

    test('runs onTaskFailed hook for all plugins', async () => {
      const executionLog: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'plugin-1',
        async onTaskFailed(task, error) {
          executionLog.push(`failed:${task.id}:${error}`)
        }
      }

      plugins.register(plugin1)

      const mockTask = { id: 'TASK-001', status: 'failed' as const, priority: 'high' as const }
      await plugins.runHook('onTaskFailed', mockTask, 'Test error')

      expect(executionLog).toEqual(['failed:TASK-001:Test error'])
    })

    test('continues execution even if one plugin hook throws', async () => {
      const executionLog: string[] = []
      const errorSpy = spyOn(logger, 'error').mockImplementation(() => {})

      const faultyPlugin: LoopworkPlugin = {
        name: 'faulty',
        async onTaskStart(task) {
          executionLog.push('faulty:before-error')
          throw new Error('Plugin crashed!')
        }
      }

      const goodPlugin: LoopworkPlugin = {
        name: 'good',
        async onTaskStart(task) {
          executionLog.push('good:executed')
        }
      }

      plugins.register(faultyPlugin)
      plugins.register(goodPlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
      await plugins.runHook('onTaskStart', mockTask)

      // Both should execute, error should be logged
      expect(executionLog).toEqual(['faulty:before-error', 'good:executed'])
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('faulty'))
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('onTaskStart'))

      errorSpy.mockRestore()
    })

    test('handles async errors in hooks gracefully', async () => {
      const errorSpy = spyOn(logger, 'error').mockImplementation(() => {})

      const asyncFaultyPlugin: LoopworkPlugin = {
        name: 'async-faulty',
        async onTaskStart(task) {
          await new Promise(resolve => setTimeout(resolve, 10))
          throw new Error('Async error!')
        }
      }

      plugins.register(asyncFaultyPlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      // Should not throw
      await expect(plugins.runHook('onTaskStart', mockTask)).resolves.toBeUndefined()

      expect(errorSpy).toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    test('passes all arguments to hook functions', async () => {
      let capturedArgs: any[] = []

      const plugin: LoopworkPlugin = {
        name: 'test',
        async onTaskFailed(task, error) {
          capturedArgs = [task, error]
        }
      }

      plugins.register(plugin)

      const mockTask = { id: 'TASK-001', status: 'failed' as const, priority: 'high' as const }
      const errorMsg = 'Test error message'
      await plugins.runHook('onTaskFailed', mockTask, errorMsg)

      expect(capturedArgs[0]).toBe(mockTask)
      expect(capturedArgs[1]).toBe(errorMsg)
    })
  })

  describe('Hook execution order', () => {
    test('plugins execute in registration order', async () => {
      const executionOrder: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'first',
        async onConfigLoad(config) {
          executionOrder.push('first')
          return config
        }
      }

      const plugin2: LoopworkPlugin = {
        name: 'second',
        async onConfigLoad(config) {
          executionOrder.push('second')
          return config
        }
      }

      const plugin3: LoopworkPlugin = {
        name: 'third',
        async onConfigLoad(config) {
          executionOrder.push('third')
          return config
        }
      }

      // Register in specific order
      plugins.register(plugin1)
      plugins.register(plugin2)
      plugins.register(plugin3)

      await plugins.runHook('onConfigLoad', {})

      expect(executionOrder).toEqual(['first', 'second', 'third'])
    })

    test('sequential async operations complete in order', async () => {
      const completionOrder: string[] = []

      const slowPlugin: LoopworkPlugin = {
        name: 'slow',
        async onTaskStart(task) {
          await new Promise(resolve => setTimeout(resolve, 20))
          completionOrder.push('slow')
        }
      }

      const fastPlugin: LoopworkPlugin = {
        name: 'fast',
        async onTaskStart(task) {
          await new Promise(resolve => setTimeout(resolve, 5))
          completionOrder.push('fast')
        }
      }

      // Register slow first
      plugins.register(slowPlugin)
      plugins.register(fastPlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
      await plugins.runHook('onTaskStart', mockTask)

      // Should complete in registration order, not speed order
      expect(completionOrder).toEqual(['slow', 'fast'])
    })
  })

  describe('Multiple hook types integration', () => {
    test('plugin can handle multiple hook types', async () => {
      const hookLog: string[] = []

      const multiHookPlugin: LoopworkPlugin = {
        name: 'multi-hook',
        async onConfigLoad(config) {
          hookLog.push('config-loaded')
          return config
        },
        async onTaskStart(task) {
          hookLog.push(`task-start:${task.id}`)
        },
        async onTaskComplete(task) {
          hookLog.push(`task-complete:${task.id}`)
        },
        async onTaskFailed(task, error) {
          hookLog.push(`task-failed:${task.id}`)
        }
      }

      plugins.register(multiHookPlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      // Simulate lifecycle
      await plugins.runHook('onConfigLoad', {})
      await plugins.runHook('onTaskStart', mockTask)
      await plugins.runHook('onTaskComplete', mockTask)
      await plugins.runHook('onTaskFailed', mockTask, 'error')

      expect(hookLog).toEqual([
        'config-loaded',
        'task-start:TASK-001',
        'task-complete:TASK-001',
        'task-failed:TASK-001'
      ])
    })

    test('different plugins handle different hooks', async () => {
      const hookLog: string[] = []

      const startPlugin: LoopworkPlugin = {
        name: 'start-only',
        async onTaskStart(task) {
          hookLog.push('start-plugin')
        }
      }

      const completePlugin: LoopworkPlugin = {
        name: 'complete-only',
        async onTaskComplete(task) {
          hookLog.push('complete-plugin')
        }
      }

      plugins.register(startPlugin)
      plugins.register(completePlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      await plugins.runHook('onTaskStart', mockTask)
      await plugins.runHook('onTaskComplete', mockTask)

      expect(hookLog).toEqual(['start-plugin', 'complete-plugin'])
    })
  })

  describe('Edge cases and error handling', () => {
    test('runHook works with no plugins registered', async () => {
      // Should not throw
      await expect(plugins.runHook('onTaskStart', {} as any)).resolves.toBeUndefined()
    })

    test('runHook handles non-function hook properties', async () => {
      const weirdPlugin: any = {
        name: 'weird',
        onTaskStart: 'not a function' // Invalid hook
      }

      plugins.register(weirdPlugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      // Should not throw, just skip the invalid hook
      await expect(plugins.runHook('onTaskStart', mockTask)).resolves.toBeUndefined()
    })

    test('runHook handles undefined hook gracefully', async () => {
      const plugin: LoopworkPlugin = {
        name: 'minimal',
        // No hooks defined
      }

      plugins.register(plugin)

      // Should not throw
      await expect(plugins.runHook('onTaskStart', {} as any)).resolves.toBeUndefined()
    })

    test('error in one hook does not prevent other hooks on same plugin', async () => {
      const executionLog: string[] = []
      const errorSpy = spyOn(logger, 'error').mockImplementation(() => {})

      const plugin: LoopworkPlugin = {
        name: 'multi',
        async onTaskStart(task) {
          throw new Error('Start failed')
        },
        async onTaskComplete(task) {
          executionLog.push('complete-executed')
        }
      }

      plugins.register(plugin)

      const mockTask = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      await plugins.runHook('onTaskStart', mockTask) // Should log error but not throw
      await plugins.runHook('onTaskComplete', mockTask) // Should still work

      expect(executionLog).toEqual(['complete-executed'])
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('Real-world simulation', () => {
    test('simulates Discord + Todoist + Backend plugin workflow', async () => {
      const notifications: string[] = []

      const discordPlugin: LoopworkPlugin = {
        name: 'discord',
        async onTaskStart(task) {
          notifications.push(`Discord: Task ${task.id} started`)
        },
        async onTaskComplete(task) {
          notifications.push(`Discord: Task ${task.id} completed!`)
        }
      }

      const todoistPlugin: LoopworkPlugin = {
        name: 'todoist',
        async onTaskComplete(task) {
          notifications.push(`Todoist: Mark ${task.id} as done`)
        }
      }

      const metricsPlugin: LoopworkPlugin = {
        name: 'metrics',
        async onTaskStart(task) {
          notifications.push(`Metrics: Start timer for ${task.id}`)
        },
        async onTaskComplete(task) {
          notifications.push(`Metrics: Record completion time for ${task.id}`)
        },
        async onTaskFailed(task, error) {
          notifications.push(`Metrics: Record failure for ${task.id}`)
        }
      }

      plugins.register(discordPlugin)
      plugins.register(todoistPlugin)
      plugins.register(metricsPlugin)

      const task = { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }

      // Simulate workflow
      await plugins.runHook('onTaskStart', task)
      // ... work happens ...
      await plugins.runHook('onTaskComplete', task)

      expect(notifications).toEqual([
        'Discord: Task TASK-001 started',
        'Metrics: Start timer for TASK-001',
        'Discord: Task TASK-001 completed!',
        'Todoist: Mark TASK-001 as done',
        'Metrics: Record completion time for TASK-001'
      ])
    })
  })
})
