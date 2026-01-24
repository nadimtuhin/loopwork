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
      const spy = spyOn(console, 'warn').mockImplementation(() => {})
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
})
