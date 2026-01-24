import { describe, expect, test } from 'bun:test'
import {
  defineConfig,
  withTelegram,
  withCostTracking,
  withJSON,
  withGitHub,
  withPlugin,
  withAsana,
  withEverhour,
  withTodoist,
  withDiscord,
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
      expect(config.cli).toBe('opencode')
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

  describe('withTelegram', () => {
    test('adds telegram config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withTelegram()(base)

      expect(config.telegram).toBeDefined()
      expect(config.telegram?.notifications).toBe(true)
      expect(config.telegram?.silent).toBe(false)
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withTelegram({
        botToken: 'test-token',
        chatId: 'test-chat',
        silent: true,
      })(base)

      expect(config.telegram?.botToken).toBe('test-token')
      expect(config.telegram?.chatId).toBe('test-chat')
      expect(config.telegram?.silent).toBe(true)
    })
  })

  describe('withCostTracking', () => {
    test('adds cost tracking config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withCostTracking()(base)

      expect(config.costTracking).toBeDefined()
      expect(config.costTracking?.enabled).toBe(true)
      expect(config.costTracking?.defaultModel).toBe('claude-3.5-sonnet')
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withCostTracking({
        enabled: false,
        defaultModel: 'gpt-4',
      })(base)

      expect(config.costTracking?.enabled).toBe(false)
      expect(config.costTracking?.defaultModel).toBe('gpt-4')
    })
  })

  describe('withJSON', () => {
    test('sets json backend with defaults', () => {
      const base = defineConfig({ backend: { type: 'github' } })
      const config = withJSON()(base)

      expect(config.backend.type).toBe('json')
      expect(config.backend.tasksFile).toBe('.specs/tasks/tasks.json')
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'github' } })
      const config = withJSON({ tasksFile: 'custom/tasks.json', tasksDir: 'custom' })(base)

      expect(config.backend.tasksFile).toBe('custom/tasks.json')
      expect(config.backend.tasksDir).toBe('custom')
    })
  })

  describe('withGitHub', () => {
    test('sets github backend', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withGitHub({ repo: 'owner/repo' })(base)

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

  describe('withAsana', () => {
    test('adds asana config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withAsana()(base)

      expect(config.asana).toBeDefined()
      expect(config.asana?.autoCreate).toBe(false)
      expect(config.asana?.syncStatus).toBe(true)
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withAsana({
        accessToken: 'test-token',
        projectId: 'project-123',
        autoCreate: true,
      })(base)

      expect(config.asana?.accessToken).toBe('test-token')
      expect(config.asana?.projectId).toBe('project-123')
      expect(config.asana?.autoCreate).toBe(true)
    })
  })

  describe('withEverhour', () => {
    test('adds everhour config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withEverhour()(base)

      expect(config.everhour).toBeDefined()
      expect(config.everhour?.autoStartTimer).toBe(true)
      expect(config.everhour?.autoStopTimer).toBe(true)
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withEverhour({
        apiKey: 'test-key',
        autoStartTimer: false,
      })(base)

      expect(config.everhour?.apiKey).toBe('test-key')
      expect(config.everhour?.autoStartTimer).toBe(false)
    })
  })

  describe('withTodoist', () => {
    test('adds todoist config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withTodoist()(base)

      expect(config.todoist).toBeDefined()
      expect(config.todoist?.syncStatus).toBe(true)
      expect(config.todoist?.addComments).toBe(true)
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withTodoist({
        apiToken: 'test-token',
        projectId: 'project-456',
        addComments: false,
      })(base)

      expect(config.todoist?.apiToken).toBe('test-token')
      expect(config.todoist?.projectId).toBe('project-456')
      expect(config.todoist?.addComments).toBe(false)
    })
  })

  describe('withDiscord', () => {
    test('adds discord config with defaults', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withDiscord()(base)

      expect(config.discord).toBeDefined()
      expect(config.discord?.username).toBe('Loopwork')
      expect(config.discord?.notifyOnStart).toBe(false)
      expect(config.discord?.notifyOnComplete).toBe(true)
      expect(config.discord?.notifyOnFail).toBe(true)
      expect(config.discord?.notifyOnLoopEnd).toBe(true)
    })

    test('uses provided options', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = withDiscord({
        webhookUrl: 'https://discord.com/webhook',
        username: 'Custom Bot',
        mentionOnFail: '<@123>',
      })(base)

      expect(config.discord?.webhookUrl).toBe('https://discord.com/webhook')
      expect(config.discord?.username).toBe('Custom Bot')
      expect(config.discord?.mentionOnFail).toBe('<@123>')
    })
  })

  describe('compose', () => {
    test('composes multiple wrappers', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = compose(
        withTelegram({ botToken: 'tg-token' }),
        withCostTracking({ enabled: true }),
        withDiscord({ webhookUrl: 'discord-url' })
      )(base)

      expect(config.telegram?.botToken).toBe('tg-token')
      expect(config.costTracking?.enabled).toBe(true)
      expect(config.discord?.webhookUrl).toBe('discord-url')
    })

    test('applies wrappers in order', () => {
      const base = defineConfig({ backend: { type: 'json' } })
      const config = compose(
        withJSON({ tasksFile: 'first.json' }),
        withJSON({ tasksFile: 'second.json' })
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
      expect(defaults.cli).toBe('opencode')
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
