import { describe, expect, test } from 'bun:test'
import {
  defineConfig,
  withJSONBackend,
  withGitHubBackend,
  withPlugin,
  compose,
  defaults,
} from '../src/plugins'

describe('loopwork-config-types', () => {
  describe('defineConfig', () => {
    test('returns config with defaults', () => {
      const config = defineConfig({
        backend: { type: 'json', tasksFile: 'tasks.json' },
      })

      expect(config.backend).toEqual({ type: 'json', tasksFile: 'tasks.json' })
      expect(config.cli).toBe('claude')
      expect(config.maxIterations).toBe(50)
      expect(config.timeout).toBe(600)
      expect(config.namespace).toBe('default')
      expect(config.plugins).toEqual([])
    })

    test('overrides defaults with provided values', () => {
      const config = defineConfig({
        backend: { type: 'github', repo: 'owner/repo' },
        cli: 'claude',
        maxIterations: 100,
        timeout: 300,
      })

      expect(config.cli).toBe('claude')
      expect(config.maxIterations).toBe(100)
      expect(config.timeout).toBe(300)
    })
  })

  describe('withJSONBackend', () => {
    test('sets json backend with defaults', () => {
      const base = defineConfig({ backend: { type: 'github' } })
      const config = withJSONBackend()(base)

      expect(config.backend.type).toBe('json')
      expect(config.backend.tasksFile).toBe('.specs/tasks/tasks.json')
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'github' } })
      const config = withJSONBackend({ tasksFile: 'custom/tasks.json', tasksDir: 'custom' })(base)

      expect(config.backend.tasksFile).toBe('custom/tasks.json')
      expect(config.backend.tasksDir).toBe('custom')
    })
  })

  describe('withGitHubBackend', () => {
    test('sets github backend', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withGitHubBackend({ repo: 'owner/repo' })(base)

      expect(config.backend.type).toBe('github')
      expect(config.backend.repo).toBe('owner/repo')
    })
  })

  describe('withPlugin', () => {
    test('adds plugin to plugins array', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const plugin = { name: 'test-plugin' }
      const config = withPlugin(plugin)(base)

      expect(config.plugins).toHaveLength(1)
      expect(config.plugins?.[0].name).toBe('test-plugin')
    })

    test('appends to existing plugins', () => {
      const base = defineConfig({
        backend: { type: 'json' },
        plugins: [{ name: 'existing' }],
      })
      const config = withPlugin({ name: 'new-plugin' })(base)

      expect(config.plugins).toHaveLength(2)
      expect(config.plugins?.[0].name).toBe('existing')
      expect(config.plugins?.[1].name).toBe('new-plugin')
    })
  })

  describe('compose', () => {
    test('composes multiple wrappers', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = compose(
        withJSONBackend({ tasksFile: 'composed.json' }),
        withPlugin({ name: 'test-plugin' })
      )(base)

      expect(config.backend.tasksFile).toBe('composed.json')
      expect(config.plugins).toHaveLength(2)
      expect(config.plugins?.[1].name).toBe('test-plugin')
    })

    test('applies wrappers in order', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = compose(
        withJSONBackend({ tasksFile: 'first.json' }),
        withJSONBackend({ tasksFile: 'second.json' })
      )(base)

      // Last wrapper wins
      expect(config.backend.tasksFile).toBe('second.json')
    })

    test('works with empty wrappers', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = compose()(base)

      expect(config).toEqual(base)
    })
  })

  describe('defaults', () => {
    test('has expected default values', () => {
      expect(defaults.cli).toBe('claude')
      expect(defaults.maxIterations).toBe(50)
      expect(defaults.timeout).toBe(600)
      expect(defaults.namespace).toBe('default')
      expect(defaults.autoConfirm).toBe(false)
      expect(defaults.dryRun).toBe(false)
      expect(defaults.debug).toBe(false)
      expect(defaults.maxRetries).toBe(3)
      expect(defaults.circuitBreakerThreshold).toBe(5)
      expect(defaults.taskDelay).toBe(2000)
      expect(defaults.retryDelay).toBe(3000)
    })
  })
})
