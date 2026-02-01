import { describe, test, expect, beforeEach } from 'bun:test'
import { createDebuggerPlugin, withDebugger, type DebuggerConfig } from '../../src/plugins/debugger'
import type { TaskContext } from '../../src/contracts/plugin'
import { Debugger } from '../../src/core/debugger'
import type { Task } from '../../src/contracts/task'

describe('Debugger Plugin', () => {
  describe('createDebuggerPlugin', () => {
    test('should create plugin with correct name', () => {
      const plugin = createDebuggerPlugin()
      expect(plugin.name).toBe('debugger')
    })

    test('should have enhancement classification', () => {
      const plugin = createDebuggerPlugin()
      expect(plugin.classification).toBe('enhancement')
    })

    test('should not require network', () => {
      const plugin = createDebuggerPlugin()
      expect(plugin.requiresNetwork).toBe(false)
    })

    test('should disable debugger by default', () => {
      const plugin = createDebuggerPlugin()
      const config: any = {}
      const result = plugin.onConfigLoad?.(config)
      const debuggerInstance = result?.debugger as Debugger
      expect(debuggerInstance?.isEnabled()).toBe(false)
    })

    test('should enable debugger when configured', () => {
      const options: DebuggerConfig = { enabled: true }
      const plugin = createDebuggerPlugin(options)
      const config: any = {}
      const result = plugin.onConfigLoad?.(config)
      const debuggerInstance = result?.debugger as Debugger
      expect(debuggerInstance?.isEnabled()).toBe(true)
    })

    test('should set breakpoints from config', () => {
      const options: DebuggerConfig = {
        enabled: true,
        breakpoints: [
          { eventType: 'TASK_START', enabled: true },
          { eventType: 'PRE_PROMPT', enabled: false, taskId: 'TASK-001' },
        ],
      }
      const plugin = createDebuggerPlugin(options)
      const config: any = {}
      const result = plugin.onConfigLoad?.(config)
      const debuggerInstance = result?.debugger as Debugger
      const breakpoints = debuggerInstance?.listBreakpoints()
      
      expect(breakpoints).toBeDefined()
      expect(breakpoints.length).toBeGreaterThan(0)
    })

    test('should set task context on task start', () => {
      const plugin = createDebuggerPlugin({ enabled: true })
      const context: TaskContext = {
        task: { 
          id: 'TASK-001', 
          title: 'Test', 
          description: 'Test task',
          status: 'pending', 
          priority: 'high', 
          metadata: {} 
        },
        config: { backend: { type: 'json' } } as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      }
      
      plugin.onTaskStart?.(context)
      const debuggerInstance = (plugin as any)._debugger
      expect(debuggerInstance.getContext()).toBe(context)
    })

    test('should clear task context on task complete', () => {
      const plugin = createDebuggerPlugin({ enabled: true })
      const context: TaskContext = {
        task: { 
          id: 'TASK-001', 
          title: 'Test', 
          description: 'Test task',
          status: 'pending', 
          priority: 'high', 
          metadata: {} 
        },
        config: { backend: { type: 'json' } } as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      }
      
      plugin.onTaskStart?.(context)
      plugin.onTaskComplete?.(context, { duration: 1000, success: true })
      
      const debuggerInstance = (plugin as any)._debugger
      expect(debuggerInstance.getContext()).toBeUndefined()
    })

    test('should clear task context on task failed', () => {
      const plugin = createDebuggerPlugin({ enabled: true })
      const context: TaskContext = {
        task: { 
          id: 'TASK-001', 
          title: 'Test', 
          description: 'Test task',
          status: 'pending', 
          priority: 'high', 
          metadata: {} 
        },
        config: { backend: { type: 'json' } } as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test',
      }
      
      plugin.onTaskStart?.(context)
      plugin.onTaskFailed?.(context, 'Task failed')
      
      const debuggerInstance = (plugin as any)._debugger
      expect(debuggerInstance.getContext()).toBeUndefined()
    })
  })

  describe('withDebugger config wrapper', () => {
    test('should wrap config with plugin', () => {
      const config = { plugins: [] }
      const wrapper = withDebugger({ enabled: true })
      const result = wrapper(config as any)
      
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('debugger')
    })

    test('should append to existing plugins', () => {
      const config = { plugins: [{ name: 'existing-plugin' } as any] }
      const wrapper = withDebugger({ enabled: false })
      const result = wrapper(config as any)
      
      expect(result.plugins).toHaveLength(2)
      expect(result.plugins[0].name).toBe('existing-plugin')
      expect(result.plugins[1].name).toBe('debugger')
    })

    test('should work with default options', () => {
      const config = { plugins: [] }
      const wrapper = withDebugger()
      const result = wrapper(config as any)
      
      expect(result.plugins).toHaveLength(1)
      expect(result.plugins[0].name).toBe('debugger')
    })
  })

  describe('DebuggerConfig', () => {
    test('should accept enabled flag', () => {
      const config: DebuggerConfig = { enabled: true }
      expect(config.enabled).toBe(true)
    })

    test('should accept breakpoints array', () => {
      const config: DebuggerConfig = {
        breakpoints: [
          { eventType: 'LOOP_START', enabled: true },
          { eventType: 'TASK_START', enabled: true, taskId: 'TASK-001' },
        ],
      }
      expect(config.breakpoints).toBeDefined()
      expect(config.breakpoints).toHaveLength(2)
    })

    test('should work with empty options', () => {
      const config: DebuggerConfig = {}
      expect(config.enabled).toBeUndefined()
      expect(config.breakpoints).toBeUndefined()
    })
  })
})
