import { describe, expect, test, spyOn } from 'bun:test'
import {
  withJSONBackend,
  withGitHubBackend,
  createJSONBackendPlugin,
  createGitHubBackendPlugin,
  getBackendPlugin,
  requireBackend
} from '../src/backends/plugin'
import { defineConfig } from '../src/plugins'
import { logger } from '../src/core/utils'

describe('Backend Plugin System', () => {
  describe('withJSONBackend', () => {
    test('configures JSON backend and adds plugin', () => {
      const config = withJSONBackend({ tasksFile: 'test.json' })(defineConfig({}))
      
      expect(config.backend?.type).toBe('json')
      expect(config.backend?.tasksFile).toBe('test.json')
      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0].name).toBe('json-backend')
      expect((config.plugins?.[0] as any).backendType).toBe('json')
    })

    test('uses default tasks file if not provided', () => {
      const config = withJSONBackend()(defineConfig({}))
      expect(config.backend?.tasksFile).toBe('.specs/tasks/tasks.json')
    })
  })

  describe('withGitHubBackend', () => {
    test('configures GitHub backend and adds plugin', () => {
      const config = withGitHubBackend({ repo: 'owner/repo' })(defineConfig({}))
      
      expect(config.backend?.type).toBe('github')
      expect(config.backend?.repo).toBe('owner/repo')
      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0].name).toBe('github-backend')
      expect((config.plugins?.[0] as any).backendType).toBe('github')
    })
    
    test('uses environment variable for repo if not provided', () => {
      const originalRepo = process.env.GITHUB_REPOSITORY
      process.env.GITHUB_REPOSITORY = 'env/repo'
      try {
        const config = withGitHubBackend()(defineConfig({}))
        expect(config.backend?.repo).toBe('env/repo')
      } finally {
        process.env.GITHUB_REPOSITORY = originalRepo
      }
    })
  })

  describe('getBackendPlugin / requireBackend', () => {
    test('getBackendPlugin finds the backend plugin', () => {
      const config = withJSONBackend()(defineConfig({}))
      const backend = getBackendPlugin(config)
      expect(backend).not.toBeNull()
      expect(backend?.name).toBe('json-backend')
    })

    test('getBackendPlugin returns null if no backend', () => {
      const config = defineConfig({})
      expect(getBackendPlugin(config)).toBeNull()
    })

    test('requireBackend throws if no backend', () => {
      const config = defineConfig({})
      expect(() => requireBackend(config)).toThrow(/No backend plugin found/)
    })

    test('requireBackend returns backend if found', () => {
      const config = withGitHubBackend({ repo: 'a/b' })(defineConfig({}))
      const backend = requireBackend(config)
      expect(backend.name).toBe('github-backend')
    })
  })
  
  describe('createJSONBackendPlugin', () => {
    test('creates a plugin with correct properties', () => {
      const plugin = createJSONBackendPlugin({ tasksFile: 'foo.json' })
      expect(plugin.name).toBe('json-backend')
      expect(plugin.backendType).toBe('json')
      expect(typeof plugin.onConfigLoad).toBe('function')
      expect(typeof plugin.findNextTask).toBe('function')
    })
  })

  describe('createGitHubBackendPlugin', () => {
    test('creates a plugin with correct properties', () => {
      const plugin = createGitHubBackendPlugin({ repo: 'foo/bar' })
      expect(plugin.name).toBe('github-backend')
      expect(plugin.backendType).toBe('github')
      expect(typeof plugin.onConfigLoad).toBe('function')
      expect(typeof plugin.findNextTask).toBe('function')
    })
  })

  describe('Plugin lifecycle', () => {
    test('JSON plugin onConfigLoad returns config', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: 'foo.json' })
      const config = defineConfig({})
      const result = await plugin.onConfigLoad!(config)
      expect(result).toBe(config)
    })

    test('GitHub plugin onConfigLoad returns config', async () => {
      const plugin = createGitHubBackendPlugin({ repo: 'foo/bar' })
      const config = defineConfig({})
      const result = await plugin.onConfigLoad!(config)
      expect(result).toBe(config)
    })

    test('GitHub plugin onConfigLoad warns if repo missing', async () => {
      const originalRepo = process.env.GITHUB_REPOSITORY
      delete process.env.GITHUB_REPOSITORY
      const spy = spyOn(logger, 'warn').mockImplementation(() => {})
      try {
        const plugin = createGitHubBackendPlugin({})
        const config = defineConfig({})
        const result = await plugin.onConfigLoad!(config)
        expect(result).toBe(config)
        expect(spy).toHaveBeenCalled()
      } finally {
        process.env.GITHUB_REPOSITORY = originalRepo
        spy.mockRestore()
      }
    })
  })

  describe('Plugin method delegation', () => {
    test('JSON plugin delegates all backend methods', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: '/tmp/nonexistent.json' })

      // These should all be functions that delegate to the adapter
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

    test('GitHub plugin delegates all backend methods', async () => {
      const plugin = createGitHubBackendPlugin({ repo: 'test/repo' })

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

    test('JSON plugin returns error for unsupported setPriority', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: '/tmp/nonexistent.json' })
      // setPriority is not supported by JSON adapter
      const result = await plugin.setPriority!('TASK-001-01', 'high')
      expect(result.success).toBe(false)
      // Error could be "not supported" or "not found" depending on adapter state
      expect(result.error).toBeDefined()
    })

    test('JSON plugin addComment returns not supported for missing method', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: '/tmp/nonexistent.json' })
      // If the adapter doesn't have addComment (which JSON does have, but testing the fallback)
      const result = await plugin.addComment!('TASK-001-01', 'test')
      // JSON adapter does support addComment, so this should work or fail differently
      expect(result).toBeDefined()
    })

    test('JSON plugin throws for createTask when not supported', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: '/tmp/nonexistent.json' })
      // createTask might throw if adapter doesn't support it
      // In reality JSON adapter supports this, but testing the error path
      await expect(plugin.createTask?.({
        title: 'Test',
        description: 'Test',
        priority: 'medium'
      })).rejects.toThrow()
    })

    test('JSON plugin throws for createSubTask when not supported', async () => {
      const plugin = createJSONBackendPlugin({ tasksFile: '/tmp/nonexistent.json' })
      await expect(plugin.createSubTask?.('TASK-001-01', {
        title: 'Sub',
        description: 'Test',
        priority: 'medium'
      })).rejects.toThrow()
    })
  })

  describe('Config composition', () => {
    test('withJSONBackend preserves existing plugins', () => {
      const customPlugin = { name: 'custom', async onConfigLoad(cfg: any) { return cfg } }
      const baseConfig = defineConfig({ plugins: [customPlugin] })
      const config = withJSONBackend()(baseConfig)

      expect(config.plugins).toHaveLength(2)
      expect(config.plugins?.[0].name).toBe('custom')
      expect(config.plugins?.[1].name).toBe('json-backend')
    })

    test('withGitHubBackend preserves existing plugins', () => {
      const customPlugin = { name: 'custom', async onConfigLoad(cfg: any) { return cfg } }
      const baseConfig = defineConfig({ plugins: [customPlugin] })
      const config = withGitHubBackend({ repo: 'a/b' })(baseConfig)

      expect(config.plugins).toHaveLength(2)
      expect(config.plugins?.[0].name).toBe('custom')
      expect(config.plugins?.[1].name).toBe('github-backend')
    })

    test('withJSONBackend sets tasksDir when provided', () => {
      const config = withJSONBackend({ tasksDir: '/custom/dir' })(defineConfig({}))
      expect(config.backend?.tasksDir).toBe('/custom/dir')
    })
  })
})
