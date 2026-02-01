import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createBackend, detectBackend } from '../src/backends/index'
import { createJSONBackendPlugin, createGitHubBackendPlugin, withJSONBackend, withGitHubBackend, getBackendPlugin, requireBackend } from '../src/backends/plugin'
import { defineConfig, compose, withPlugin } from '../src/plugins'
import type { LoopworkPlugin } from '../src/contracts'

/**
 * Integration tests for backend factory and plugin system
 *
 * Coverage targets:
 * - src/backends/index.ts (27.66% -> 60%+)
 * - src/backends/plugin.ts (43.30% -> 60%+)
 * - src/plugins/index.ts (48.28% -> 65%+)
 */

describe('Backend Factory Integration', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-backend-test-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('createBackend', () => {
    test('creates JSON backend with valid config', () => {
      const tasksFile = path.join(tempDir, 'tasks.json')
      fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))

      const backend = createBackend({
        type: 'json',
        tasksFile,
        tasksDir: tempDir
      })

      expect(backend).toBeDefined()
      expect(typeof backend.findNextTask).toBe('function')
      expect(typeof backend.ping).toBe('function')
    })

    test('creates GitHub backend with valid config', () => {
      const backend = createBackend({
        type: 'github',
        repo: 'test/repo'
      })

      expect(backend).toBeDefined()
      expect(typeof backend.findNextTask).toBe('function')
      expect(typeof backend.createTask).toBe('function')
    })

    test('throws error for unknown backend type', () => {
      expect(() => {
        createBackend({ type: 'unknown' } as any)
      }).toThrow(/Unknown backend type/)
    })
  })

  describe('detectBackend', () => {
    test('detects JSON backend from file system', () => {
      const specsDir = path.join(tempDir, '.specs', 'tasks')
      fs.mkdirSync(specsDir, { recursive: true })
      fs.writeFileSync(path.join(specsDir, 'tasks.json'), JSON.stringify({ tasks: [] }))

      const config = detectBackend(tempDir)

      expect(config.type).toBe('json')
      expect(config.tasksFile).toBe(path.join(tempDir, '.specs/tasks/tasks.json'))
      expect(config.tasksDir).toBe(path.join(tempDir, '.specs/tasks'))
    })

    test('detects JSON backend from LOOPWORK_BACKEND env var', () => {
      const original = process.env.LOOPWORK_BACKEND
      process.env.LOOPWORK_BACKEND = 'json'

      try {
        const config = detectBackend(tempDir)
        expect(config.type).toBe('json')
        expect(config.tasksFile).toContain('.specs/tasks/tasks.json')
      } finally {
        if (original !== undefined) {
          process.env.LOOPWORK_BACKEND = original
        } else {
          delete process.env.LOOPWORK_BACKEND
        }
      }
    })

    test('detects GitHub backend from LOOPWORK_BACKEND env var', () => {
      const originalBackend = process.env.LOOPWORK_BACKEND
      const originalRepo = process.env.LOOPWORK_REPO
      process.env.LOOPWORK_BACKEND = 'github'
      process.env.LOOPWORK_REPO = 'owner/repo'

      try {
        const config = detectBackend(tempDir)
        expect(config.type).toBe('github')
        expect(config.repo).toBe('owner/repo')
      } finally {
        if (originalBackend !== undefined) {
          process.env.LOOPWORK_BACKEND = originalBackend
        } else {
          delete process.env.LOOPWORK_BACKEND
        }
        if (originalRepo !== undefined) {
          process.env.LOOPWORK_REPO = originalRepo
        } else {
          delete process.env.LOOPWORK_REPO
        }
      }
    })

    test('defaults to GitHub backend when no files exist', () => {
      const originalBackend = process.env.LOOPWORK_BACKEND
      delete process.env.LOOPWORK_BACKEND

      try {
        const config = detectBackend(tempDir)
        expect(config.type).toBe('github')
      } finally {
        if (originalBackend !== undefined) {
          process.env.LOOPWORK_BACKEND = originalBackend
        }
      }
    })
  })
})

describe('Backend Plugin Integration', () => {
  let tempDir: string
  let tasksFile: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-plugin-test-'))
    tasksFile = path.join(tempDir, 'tasks.json')
    fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('JSON Backend Plugin - Full Lifecycle', () => {
    test('plugin lifecycle hooks fire correctly', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile })
      const config = defineConfig({})

      // onConfigLoad should initialize adapter
      const resultConfig = await plugin.onConfigLoad!(config)
      expect(resultConfig).toBe(config)

      // Plugin methods should work after initialization
      const pingResult = await plugin.ping()
      expect(pingResult.ok).toBe(true)
      expect(pingResult.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test('plugin integrates with actual JSON backend operations', async () => {
      // Setup tasks
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
        ]
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData))
      fs.writeFileSync(path.join(tempDir, 'TASK-001.md'), '# TASK-001\n\nTest task')

      const plugin = createJSONBackendPlugin({ tasksFile, tasksDir: tempDir })
      await plugin.onConfigLoad!(defineConfig({}))

      // Test backend operations through plugin
      const task = await plugin.findNextTask()
      expect(task).not.toBeNull()
      expect(task!.id).toBe('TASK-001')

      const result = await plugin.markInProgress('TASK-001')
      expect(result.success).toBe(true)

      const updatedTask = await plugin.getTask('TASK-001')
      expect(updatedTask!.status).toBe('in-progress')

      const completeResult = await plugin.markCompleted('TASK-001', 'Done!')
      expect(completeResult.success).toBe(true)

      const completedTask = await plugin.getTask('TASK-001')
      expect(completedTask!.status).toBe('completed')
    })

    test('plugin handles task dependencies through integration', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const },
          { id: 'TASK-002', status: 'pending' as const, priority: 'high' as const, dependsOn: ['TASK-001'] }
        ]
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData))
      fs.writeFileSync(path.join(tempDir, 'TASK-001.md'), '# TASK-001')
      fs.writeFileSync(path.join(tempDir, 'TASK-002.md'), '# TASK-002')

      const plugin = createJSONBackendPlugin({ tasksFile, tasksDir: tempDir })
      await plugin.onConfigLoad!(defineConfig({}))

      // TASK-002 dependencies not met initially
      const depsMet = await plugin.areDependenciesMet('TASK-002')
      expect(depsMet).toBe(false)

      // Get dependencies
      const deps = await plugin.getDependencies('TASK-002')
      expect(deps).toHaveLength(1)
      expect(deps[0].id).toBe('TASK-001')

      // Get dependents
      const dependents = await plugin.getDependents('TASK-001')
      expect(dependents).toHaveLength(1)
      expect(dependents[0].id).toBe('TASK-002')

      // Complete TASK-001
      await plugin.markInProgress('TASK-001')
      await plugin.markCompleted('TASK-001')

      // Now TASK-002 dependencies are met
      const depsMetNow = await plugin.areDependenciesMet('TASK-002')
      expect(depsMetNow).toBe(true)
    })

    test('plugin handles sub-tasks correctly', async () => {
      const tasksData = {
        tasks: [
          { id: 'TASK-PARENT', status: 'pending' as const, priority: 'high' as const }
        ]
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData))
      fs.writeFileSync(path.join(tempDir, 'TASK-PARENT.md'), '# Parent Task')

      const plugin = createJSONBackendPlugin({ tasksFile, tasksDir: tempDir })
      await plugin.onConfigLoad!(defineConfig({}))

      // Create sub-task
      const subtask = await plugin.createSubTask!('TASK-PARENT', {
        title: 'Subtask',
        description: 'Test subtask',
        priority: 'medium'
      })

      expect(subtask.parentId).toBe('TASK-PARENT')
      expect(subtask.status).toBe('pending')

      // Get sub-tasks
      const subtasks = await plugin.getSubTasks('TASK-PARENT')
      expect(subtasks).toHaveLength(1)
      expect(subtasks[0].parentId).toBe('TASK-PARENT')
    })

    test('plugin handles error cases gracefully', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile, tasksDir: tempDir })
      await plugin.onConfigLoad!(defineConfig({}))

      // Get non-existent task
      const task = await plugin.getTask('NONEXISTENT')
      expect(task).toBeNull()

      // Mark non-existent task
      const result = await plugin.markInProgress('NONEXISTENT')
      expect(result.success).toBe(false)
    })
  })

  describe('GitHub Backend Plugin - Full Lifecycle', () => {
    test('plugin lifecycle warns on missing repo', async () => {
      const originalRepo = process.env.GITHUB_REPOSITORY
      delete process.env.GITHUB_REPOSITORY

      try {
        const plugin = createGitHubBackendPlugin({})
        const config = defineConfig({})

        // Should still return config even without repo
        const resultConfig = await plugin.onConfigLoad!(config)
        expect(resultConfig).toBe(config)
      } finally {
        if (originalRepo !== undefined) {
          process.env.GITHUB_REPOSITORY = originalRepo
        }
      }
    })

    test('plugin methods are all delegated', async () => {
      const plugin = createGitHubBackendPlugin({ repo: 'test/repo' })

      // All methods should be callable (even if they fail due to no API)
      expect(typeof plugin.findNextTask).toBe('function')
      expect(typeof plugin.getTask).toBe('function')
      expect(typeof plugin.listPendingTasks).toBe('function')
      expect(typeof plugin.countPending).toBe('function')
      expect(typeof plugin.markInProgress).toBe('function')
      expect(typeof plugin.markCompleted).toBe('function')
      expect(typeof plugin.markFailed).toBe('function')
      expect(typeof plugin.resetToPending).toBe('function')
      expect(typeof plugin.addComment).toBe('function')
      expect(typeof plugin.ping).toBe('function')
      expect(typeof plugin.getSubTasks).toBe('function')
      expect(typeof plugin.getDependencies).toBe('function')
      expect(typeof plugin.getDependents).toBe('function')
      expect(typeof plugin.areDependenciesMet).toBe('function')
      expect(typeof plugin.createTask).toBe('function')
      expect(typeof plugin.createSubTask).toBe('function')
      expect(typeof plugin.addDependency).toBe('function')
      expect(typeof plugin.removeDependency).toBe('function')
      expect(typeof plugin.setPriority).toBe('function')
    })
  })

  describe('Config Wrappers Integration', () => {
    test('withJSONBackend creates working configuration', async () => {
      const config = withJSONBackend({ tasksFile, tasksDir: tempDir })(defineConfig({}))

      expect(config.backend?.type).toBe('json')
      expect(config.plugins).toHaveLength(1)

      const backend = getBackendPlugin(config)
      expect(backend).not.toBeNull()
      expect(backend!.backendType).toBe('json')

      // Backend should work
      await backend!.onConfigLoad!(config)
      const pingResult = await backend!.ping()
      expect(pingResult.ok).toBe(true)
    })

    test('withGitHubBackend creates working configuration', () => {
      const config = withGitHubBackend({ repo: 'owner/repo' })(defineConfig({}))

      expect(config.backend?.type).toBe('github')
      expect(config.plugins).toHaveLength(1)

      const backend = getBackendPlugin(config)
      expect(backend).not.toBeNull()
      expect(backend!.backendType).toBe('github')
    })

    test('multiple plugins can coexist', () => {
      const customPlugin: LoopworkPlugin = {
        name: 'custom-plugin',
        async onTaskStart(task) {
          // Custom logic
        }
      }

      const config = compose(
        withPlugin(customPlugin),
        withJSONBackend({ tasksFile })
      )(defineConfig({}))

      expect(config.plugins).toHaveLength(2)
      expect(config.plugins![0].name).toBe('custom-plugin')
      expect(config.plugins![1].name).toBe('json-backend')

      const backend = getBackendPlugin(config)
      expect(backend).not.toBeNull()
    })

    test('requireBackend throws when no backend configured', () => {
      const config = defineConfig({})

      expect(() => requireBackend(config)).toThrow(/No backend plugin found/)
    })

    test('requireBackend returns backend when configured', () => {
      const config = withJSONBackend({ tasksFile })(defineConfig({}))
      const backend = requireBackend(config)

      expect(backend.name).toBe('json-backend')
      expect(backend.backendType).toBe('json')
    })
  })
})

describe('Plugin System Integration', () => {
  let tempDir: string
  let tasksFile: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-plugin-sys-test-'))
    tasksFile = path.join(tempDir, 'tasks.json')
    fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [] }))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Multi-plugin orchestration', () => {
    test('multiple plugins execute in order', async () => {
      const executionLog: string[] = []

      const plugin1: LoopworkPlugin = {
        name: 'plugin-1',
        async onConfigLoad(config) {
          executionLog.push('plugin-1:onConfigLoad')
          return config
        },
        async onTaskStart(task) {
          executionLog.push('plugin-1:onTaskStart')
        }
      }

      const plugin2: LoopworkPlugin = {
        name: 'plugin-2',
        async onConfigLoad(config) {
          executionLog.push('plugin-2:onConfigLoad')
          return config
        },
        async onTaskStart(task) {
          executionLog.push('plugin-2:onTaskStart')
        }
      }

      const config = compose(
        withPlugin(plugin1),
        withPlugin(plugin2),
        withJSONBackend({ tasksFile, tasksDir: tempDir })
      )(defineConfig({}))

      // Simulate lifecycle
      for (const plugin of config.plugins!) {
        if (plugin.onConfigLoad) {
          await plugin.onConfigLoad(config)
        }
      }

      const mockTask = {
        id: 'TASK-001',
        status: 'pending' as const,
        priority: 'high' as const
      }

      for (const plugin of config.plugins!) {
        if (plugin.onTaskStart) {
          await plugin.onTaskStart(mockTask)
        }
      }

      expect(executionLog).toEqual([
        'plugin-1:onConfigLoad',
        'plugin-2:onConfigLoad',
        'plugin-1:onTaskStart',
        'plugin-2:onTaskStart',
      ])
    })

    test('plugin error isolation - one plugin error does not stop others', async () => {
      const executionLog: string[] = []

      const faultyPlugin: LoopworkPlugin = {
        name: 'faulty-plugin',
        async onTaskStart(task) {
          executionLog.push('faulty:before-error')
          throw new Error('Plugin error!')
        }
      }

      const goodPlugin: LoopworkPlugin = {
        name: 'good-plugin',
        async onTaskStart(task) {
          executionLog.push('good:onTaskStart')
        }
      }

      const config = compose(
        withPlugin(faultyPlugin),
        withPlugin(goodPlugin)
      )(defineConfig({}))

      const mockTask = {
        id: 'TASK-001',
        status: 'pending' as const,
        priority: 'high' as const
      }

      // Simulate error handling (in real system, orchestrator catches errors)
      for (const plugin of config.plugins!) {
        if (plugin.onTaskStart) {
          try {
            await plugin.onTaskStart(mockTask)
          } catch (error) {
            // Log error but continue
            executionLog.push('error-caught')
          }
        }
      }

      expect(executionLog).toContain('faulty:before-error')
      expect(executionLog).toContain('error-caught')
      expect(executionLog).toContain('good:onTaskStart')
    })
  })

  describe('Backend + Plugin integration workflow', () => {
    test('full workflow with backend and multiple plugins', async () => {
      const hookLog: string[] = []

      const discordPlugin: LoopworkPlugin = {
        name: 'mock-discord',
        async onTaskStart(task) {
          hookLog.push(`discord:task-start:${task.id}`)
        },
        async onTaskComplete(task) {
          hookLog.push(`discord:task-complete:${task.id}`)
        }
      }

      const todoistPlugin: LoopworkPlugin = {
        name: 'mock-todoist',
        async onTaskStart(task) {
          hookLog.push(`todoist:task-start:${task.id}`)
        },
        async onTaskComplete(task) {
          hookLog.push(`todoist:task-complete:${task.id}`)
        }
      }

      // Setup task
      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
        ]
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData))
      fs.writeFileSync(path.join(tempDir, 'TASK-001.md'), '# TASK-001')

      const config = compose(
        withPlugin(discordPlugin),
        withPlugin(todoistPlugin),
        withJSONBackend({ tasksFile, tasksDir: tempDir })
      )(defineConfig({}))

      // Get backend
      const backend = requireBackend(config)
      await backend.onConfigLoad!(config)

      // Simulate workflow
      const task = await backend.findNextTask()
      expect(task).not.toBeNull()

      // Fire onTaskStart hooks
      for (const plugin of config.plugins!) {
        if (plugin.onTaskStart) {
          await plugin.onTaskStart(task!)
        }
      }

      // Mark in progress via backend
      await backend.markInProgress(task!.id)

      // Mark completed
      await backend.markCompleted(task!.id)

      // Fire onTaskComplete hooks
      for (const plugin of config.plugins!) {
        if (plugin.onTaskComplete) {
          await plugin.onTaskComplete(task!)
        }
      }

      expect(hookLog).toEqual([
        'discord:task-start:TASK-001',
        'todoist:task-start:TASK-001',
        'discord:task-complete:TASK-001',
        'todoist:task-complete:TASK-001',
      ])
    })

    test('backend plugin operations do not interfere with other plugins', async () => {
      const operationLog: string[] = []

      const monitorPlugin: LoopworkPlugin = {
        name: 'monitor',
        async onTaskStart(task) {
          operationLog.push('monitor:start')
        }
      }

      const tasksData = {
        tasks: [
          { id: 'TASK-001', status: 'pending' as const, priority: 'high' as const }
        ]
      }
      fs.writeFileSync(tasksFile, JSON.stringify(tasksData))
      fs.writeFileSync(path.join(tempDir, 'TASK-001.md'), '# TASK-001')

      const config = compose(
        withPlugin(monitorPlugin),
        withJSONBackend({ tasksFile, tasksDir: tempDir })
      )(defineConfig({}))

      const backend = requireBackend(config)
      await backend.onConfigLoad!(config)

      // Backend operations
      const task = await backend.findNextTask()
      operationLog.push('backend:findNextTask')

      await backend.markInProgress(task!.id)
      operationLog.push('backend:markInProgress')

      // Plugin hook
      for (const plugin of config.plugins!) {
        if (plugin.onTaskStart && plugin.name !== 'json-backend') {
          await plugin.onTaskStart(task!)
        }
      }

      expect(operationLog).toEqual([
        'backend:findNextTask',
        'backend:markInProgress',
        'monitor:start'
      ])
    })
  })

  describe('Backend switching', () => {
    test('can switch from JSON to GitHub backend', () => {
      const config1 = withJSONBackend({ tasksFile })(defineConfig({}))
      expect(config1.backend?.type).toBe('json')
      expect(getBackendPlugin(config1)?.backendType).toBe('json')

      // Create new config with GitHub backend
      const config2 = withGitHubBackend({ repo: 'owner/repo' })(defineConfig({}))
      expect(config2.backend?.type).toBe('github')
      expect(getBackendPlugin(config2)?.backendType).toBe('github')
    })

    test('last backend wins when multiple backends configured', () => {
      // This is a configuration error, but test the behavior
      const config = compose(
        withJSONBackend({ tasksFile }),
        withGitHubBackend({ repo: 'owner/repo' })
      )(defineConfig({}))

      // Last one wins
      expect(config.backend?.type).toBe('github')

      // But there are 2 backend plugins
      expect(config.plugins).toHaveLength(2)

      // getBackendPlugin returns first match
      const backend = getBackendPlugin(config)
      expect(backend?.backendType).toBe('json') // First plugin in array
    })
  })
})
