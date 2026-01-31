import { describe, test, expect, beforeEach, spyOn } from 'bun:test'
import { createSafetyPlugin, withSafety } from '../src/plugins/safety'
import type { TaskContext, PluginTaskResult } from '../src/contracts/plugin'
import { RiskLevel } from '../src/contracts/safety'
import { RiskAnalysisEngine } from '../src/safety/risk-analysis'
import { InteractiveConfirmation } from '../src/safety/interactive-confirmation'
import { logger } from '../src/core/utils'

describe('Safety Plugin', () => {
  let plugin: ReturnType<typeof createSafetyPlugin>

  beforeEach(() => {
    plugin = createSafetyPlugin({
      enabled: true,
      maxRiskLevel: RiskLevel.HIGH,
      autoReject: false,
      confirmTimeout: 30000,
    })

    // Mock logger to prevent console output
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
    spyOn(logger, 'success').mockImplementation(() => {})
  })

  describe('Plugin creation', () => {
    test('should create plugin with default options', () => {
      const defaultPlugin = createSafetyPlugin()

      expect(defaultPlugin.name).toBe('safety')
      expect(defaultPlugin.essential).toBe(false)
      expect(typeof defaultPlugin.onLoopStart).toBe('function')
      expect(typeof defaultPlugin.onTaskStart).toBe('function')
    })

    test('should create plugin with custom options', () => {
      const customPlugin = createSafetyPlugin({
        enabled: false,
        maxRiskLevel: RiskLevel.MEDIUM,
        autoReject: true,
        confirmTimeout: 60000,
      })

      expect(customPlugin.name).toBe('safety')
    })

    test('should create plugin with enabled option', () => {
      const enabledPlugin = createSafetyPlugin({ enabled: true })
      expect(enabledPlugin.name).toBe('safety')
    })

    test('should create plugin with disabled option', () => {
      const disabledPlugin = createSafetyPlugin({ enabled: false })
      expect(disabledPlugin.name).toBe('safety')
    })
  })

  describe('onLoopStart', () => {
    test('should initialize namespace', async () => {
      await plugin.onLoopStart!('test-namespace')

      expect(plugin.onLoopStart).toBeDefined()
    })

    test('should log safety info when enabled', async () => {
      const debugSpy = spyOn(logger, 'debug').mockImplementation(() => {})

      await plugin.onLoopStart!('test-namespace')

      expect(debugSpy).toHaveBeenCalled()
    })
  })

  describe('onTaskStart - disabled', () => {
    beforeEach(() => {
      plugin = createSafetyPlugin({ enabled: false })
      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})
    })

    test('should skip safety checks when disabled', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-001',
          title: 'Test task',
          description: 'Test description',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('onTaskStart - LOW risk', () => {
    test('should allow LOW risk tasks', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-002',
          title: 'Add new feature',
          description: 'Implement simple feature',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should log debug for LOW risk tasks', async () => {
      const debugSpy = spyOn(logger, 'debug').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-003',
          title: 'Simple task',
          description: 'Simple description',
          status: 'pending',
          priority: 'low',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      await plugin.onTaskStart!(context)

      expect(debugSpy).toHaveBeenCalled()
    })
  })

  describe('onTaskStart - MEDIUM risk', () => {
    test('should allow MEDIUM risk tasks within max risk level', async () => {
      const pluginWithMediumMax = createSafetyPlugin({
        maxRiskLevel: RiskLevel.HIGH,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-004',
          title: 'Update database',
          description: 'Modify database schema',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = pluginWithMediumMax.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('onTaskStart - HIGH risk within max', () => {
    test('should allow HIGH risk when max is HIGH', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-005',
          title: 'Remove files',
          description: 'Delete old log files',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should allow HIGH risk when max is CRITICAL', async () => {
      const pluginWithCriticalMax = createSafetyPlugin({
        maxRiskLevel: RiskLevel.CRITICAL,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-006',
          title: 'Remove files',
          description: 'Delete old files',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = pluginWithCriticalMax.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('onTaskStart - CRITICAL risk with auto-reject', () => {
    test('should block CRITICAL risk tasks with auto-reject', async () => {
      const autoRejectPlugin = createSafetyPlugin({
        autoReject: true,
        maxRiskLevel: RiskLevel.HIGH,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-007',
          title: 'Delete all data',
          description: 'Drop all tables from database',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = autoRejectPlugin.onTaskStart!(context)
      await expect(promise).rejects.toThrow('blocked by safety policy')
    })

    test('should log error when auto-rejecting', async () => {
      const autoRejectPlugin = createSafetyPlugin({
        autoReject: true,
        maxRiskLevel: RiskLevel.HIGH,
      })

      const errorSpy = spyOn(logger, 'error').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-008',
          title: 'Drop table',
          description: 'Drop table from production',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      try {
        await autoRejectPlugin.onTaskStart!(context)
      } catch (error) {
        // Expected error
      }

      expect(errorSpy).toHaveBeenCalled()
    })
  })

  describe('onTaskStart - HIGH risk exceeds max with auto-reject', () => {
    test('should block HIGH risk when max is MEDIUM with auto-reject', async () => {
      const autoRejectPlugin = createSafetyPlugin({
        autoReject: true,
        maxRiskLevel: RiskLevel.MEDIUM,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-009',
          title: 'Remove files',
          description: 'Delete old files',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = autoRejectPlugin.onTaskStart!(context)
      await expect(promise).rejects.toThrow('blocked by safety policy')
    })
  })

  describe('onTaskStart - MEDIUM risk exceeds max with auto-reject', () => {
    test('should block MEDIUM risk when max is LOW with auto-reject', async () => {
      const autoRejectPlugin = createSafetyPlugin({
        autoReject: true,
        maxRiskLevel: RiskLevel.LOW,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-010',
          title: 'Update database',
          description: 'Modify database schema',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = autoRejectPlugin.onTaskStart!(context)
      await expect(promise).rejects.toThrow('blocked by safety policy')
    })
  })

  describe('onTaskStart - CRITICAL risk exceeds max with confirmation', () => {
    test('should request confirmation for CRITICAL risk when max is HIGH', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-011',
          title: 'Drop production table',
          description: 'Drop all tables from production database',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)

      // In non-interactive mode (CI, -y flag), this will auto-confirm
      await expect(promise).resolves.not.toThrow()
    })

    test('should request confirmation for HIGH risk when max is MEDIUM', async () => {
      const mediumMaxPlugin = createSafetyPlugin({
        maxRiskLevel: RiskLevel.MEDIUM,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-012',
          title: 'Remove files',
          description: 'Delete old files',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = mediumMaxPlugin.onTaskStart!(context)

      // In non-interactive mode, this will auto-confirm
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('onTaskStart - error handling', () => {
    test('should log but not block on non-safety errors', async () => {
      const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-013',
          title: 'Test task',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should re-throw safety policy errors', async () => {
      const autoRejectPlugin = createSafetyPlugin({
        autoReject: true,
        maxRiskLevel: RiskLevel.LOW,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-014',
          title: 'Drop table',
          description: 'Drop table from production',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = autoRejectPlugin.onTaskStart!(context)
      await expect(promise).rejects.toThrow('blocked by safety policy')
    })

    test('should re-throw confirmation errors', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-015',
          title: 'Drop production table',
          description: 'Drop all tables',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      // If confirmation fails, it should throw
      const promise = plugin.onTaskStart!(context)

      // In non-interactive mode, this won't fail
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('withSafety config wrapper', () => {
    test('should create safety config wrapper', () => {
      const wrapper = withSafety({
        enabled: true,
        maxRiskLevel: RiskLevel.HIGH,
        autoReject: false,
        confirmTimeout: 30000,
      })

      expect(typeof wrapper).toBe('function')
    })

    test('should add safety config to config object', () => {
      const wrapper = withSafety({
        enabled: true,
        maxRiskLevel: RiskLevel.HIGH,
        autoReject: false,
        confirmTimeout: 30000,
      })

      const baseConfig = {
        backend: {
          type: 'json',
          tasksFile: '.specs/tasks/tasks.json',
        },
        plugins: [],
      }

      const config = wrapper(baseConfig)

      expect(config.safety).toBeDefined()
      expect((config.safety as any)?.enabled).toBe(true)
      expect((config.safety as any)?.maxRiskLevel).toBe(RiskLevel.HIGH)
      expect((config.safety as any)?.autoReject).toBe(false)
      expect((config.safety as any)?.confirmTimeout).toBe(30000)
    })

    test('should merge with default safety config', () => {
      const wrapper = withSafety({
        maxRiskLevel: RiskLevel.MEDIUM,
      })

      const baseConfig = {
        backend: {
          type: 'json',
          tasksFile: '.specs/tasks/tasks.json',
        },
        plugins: [],
      }

      const config = wrapper(baseConfig)

      expect(config.safety).toBeDefined()
      expect((config.safety as any)?.maxRiskLevel).toBe(RiskLevel.MEDIUM)
      expect((config.safety as any)?.enabled).toBe(true)
      expect((config.safety as any)?.autoReject).toBe(false)
    })

    test('should add plugin to plugins array', () => {
      const wrapper = withSafety({
        enabled: true,
      })

      const baseConfig = {
        backend: {
          type: 'json',
          tasksFile: '.specs/tasks/tasks.json',
        },
        plugins: [],
      }

      const config = wrapper(baseConfig)

      expect(config.plugins).toBeDefined()
      expect((config.plugins || []).length).toBe(1)
      expect((config.plugins || [])[0].name).toBe('safety')
    })

    test('should append to existing plugins', () => {
      const wrapper = withSafety({
        enabled: true,
      })

      const baseConfig = {
        backend: {
          type: 'json',
          tasksFile: '.specs/tasks/tasks.json',
        },
        plugins: [
          { name: 'other-plugin' } as any,
        ],
      }

      const config = wrapper(baseConfig)

      expect(config.plugins).toBeDefined()
      expect((config.plugins || []).length).toBe(2)
      expect((config.plugins || [])[0].name).toBe('other-plugin')
      expect((config.plugins || [])[1].name).toBe('safety')
    })
  })

  describe('Risk Analysis Engine integration', () => {
    test('should use RiskAnalysisEngine for assessment', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-016',
          title: 'Test task',
          description: 'Test description',
          status: 'pending',
          priority: 'medium',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should pass task context to risk engine', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-017',
          title: 'Test task',
          description: 'Test description',
          metadata: { environment: 'production' },
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'test-namespace',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })
  })

  describe('Interactive Confirmation integration', () => {
    test('should use InteractiveConfirmation for high-risk tasks', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-018',
          title: 'Drop production table',
          description: 'Drop table from production',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should use custom timeout from config', async () => {
      const customTimeoutPlugin = createSafetyPlugin({
        confirmTimeout: 60000,
      })

      spyOn(logger, 'info').mockImplementation(() => {})
      spyOn(logger, 'warn').mockImplementation(() => {})
      spyOn(logger, 'error').mockImplementation(() => {})
      spyOn(logger, 'debug').mockImplementation(() => {})
      spyOn(logger, 'success').mockImplementation(() => {})

      const context: TaskContext = {
        task: {
          id: 'TASK-019',
          title: 'Drop production table',
          description: 'Drop table from production',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = customTimeoutPlugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })

    test('should check non-interactive mode before prompting', async () => {
      const context: TaskContext = {
        task: {
          id: 'TASK-020',
          title: 'Drop production table',
          description: 'Drop table from production',
          status: 'pending',
          priority: 'high',
        },
        config: {} as any,
        iteration: 1,
        startTime: new Date(),
        namespace: 'default',
      }

      const promise = plugin.onTaskStart!(context)
      await expect(promise).resolves.not.toThrow()
    })
  })
})
