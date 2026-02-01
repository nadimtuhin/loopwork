import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { DroidStrategy } from '../../src/strategies/droid-strategy'
import { CrushStrategy } from '../../src/strategies/crush-strategy'
import { KimiStrategy } from '../../src/strategies/kimi-strategy'
import { KilocodeStrategy } from '../../src/strategies/kilocode-strategy'
import { createDefaultRegistry } from '../../src/strategies/registry'
import type { ICliStrategyContext } from '@loopwork-ai/contracts'

describe('CLI Strategy E2E', () => {
  describe('DroidStrategy Integration', () => {
    const strategy = new DroidStrategy()

    test('prepares valid Factory CLI command structure', () => {
      const context: ICliStrategyContext = {
        modelConfig: {
          name: 'factory-agent',
          displayName: 'Factory',
          cli: 'droid',
          model: 'default',
          timeout: 300,
        },
        prompt: 'Refactor the authentication module to use JWT tokens',
        env: {
          HOME: '/home/user',
          FACTORY_API_KEY: 'test-key',
        },
      }

      const result = strategy.prepare(context)

      expect(result.args[0]).toBe('exec')
      expect(result.args[1]).toContain('Refactor')
      expect(result.displayName).toBe('droid/Factory')
      expect(result.env.FACTORY_API_KEY).toBe('test-key')
    })

    test('handles complex prompts with special characters', () => {
      const context: ICliStrategyContext = {
        modelConfig: { name: 'droid', cli: 'droid', model: 'default' },
        prompt: 'Fix the "undefined" error in src/utils.ts:42',
        env: {},
      }

      const result = strategy.prepare(context)

      expect(result.args[1]).toContain('undefined')
      expect(result.args[1]).toContain('src/utils.ts')
    })
  })

  describe('CrushStrategy Integration', () => {
    const strategy = new CrushStrategy()

    test('prepares valid Crush CLI command with model selection', () => {
      const context: ICliStrategyContext = {
        modelConfig: {
          name: 'crush-opus',
          displayName: 'Opus',
          cli: 'crush',
          model: 'anthropic/claude-3-opus',
          args: ['--quiet'],
        },
        prompt: 'Generate a README for this Go project',
        env: {
          ANTHROPIC_API_KEY: 'sk-ant-test',
        },
      }

      const result = strategy.prepare(context)

      expect(result.args).toContain('run')
      expect(result.args).toContain('-m')
      expect(result.args).toContain('anthropic/claude-3-opus')
      expect(result.args).toContain('--quiet')
      expect(result.displayName).toBe('crush/Opus')
    })

    test('handles piped input simulation', () => {
      const context: ICliStrategyContext = {
        modelConfig: { name: 'crush', cli: 'crush', model: 'gpt-4o' },
        prompt: 'Summarize this code:\n```go\nfunc main() { fmt.Println("hello") }\n```',
        env: {},
      }

      const result = strategy.prepare(context)

      expect(result.args.some(arg => arg.includes('Summarize this code'))).toBe(true)
    })
  })

  describe('KimiStrategy Integration', () => {
    const strategy = new KimiStrategy()

    test('prepares valid Kimi CLI command with API key', () => {
      const context: ICliStrategyContext = {
        modelConfig: {
          name: 'kimi-k2.5',
          displayName: 'Kimi K2.5',
          cli: 'kimi',
          model: 'k2.5',
        },
        prompt: 'Analyze the performance bottlenecks in this Python script',
        env: {},
        permissions: {
          MOONSHOT_API_KEY: 'moonshot-test-key',
        },
      }

      const result = strategy.prepare(context)

      expect(result.stdinInput).toContain('Analyze the performance')
      expect(result.env.MOONSHOT_API_KEY).toBe('moonshot-test-key')
      expect(result.displayName).toBe('kimi/Kimi K2.5')
    })

    test('handles long context prompts', () => {
      const longPrompt = 'Analyze this file:\n' + 'x'.repeat(10000)
      const context: ICliStrategyContext = {
        modelConfig: { name: 'kimi', cli: 'kimi', model: 'k2.5' },
        prompt: longPrompt,
        env: {},
      }

      const result = strategy.prepare(context)

      expect(result.stdinInput?.length).toBeGreaterThan(10000)
    })
  })

  describe('KilocodeStrategy Integration', () => {
    const strategy = new KilocodeStrategy()

    test('prepares valid Kilocode CLI command with mode', () => {
      const context: ICliStrategyContext = {
        modelConfig: {
          name: 'kilocode-architect',
          displayName: 'Architect',
          cli: 'kilocode',
          model: 'default',
          args: ['--mode', 'architect'],
        },
        prompt: 'Design the data layer architecture for a todo app',
        env: {},
      }

      const result = strategy.prepare(context)

      expect(result.args).toContain('--mode')
      expect(result.args).toContain('architect')
      expect(result.stdinInput).toContain('data layer architecture')
      expect(result.displayName).toBe('kilocode/Architect')
    })

    test('handles continuation mode', () => {
      const context: ICliStrategyContext = {
        modelConfig: {
          name: 'kilocode',
          cli: 'kilocode',
          model: 'default',
          args: ['--continue'],
        },
        prompt: 'Continue fixing the remaining type errors',
        env: {},
      }

      const result = strategy.prepare(context)

      expect(result.args).toContain('--continue')
    })
  })

  describe('Registry with All Strategies', () => {
    test('registry contains all 7 CLI strategies', () => {
      const registry = createDefaultRegistry()
      const types = registry.getRegisteredTypes()

      expect(types).toHaveLength(7)
      expect(types).toContain('claude')
      expect(types).toContain('opencode')
      expect(types).toContain('gemini')
      expect(types).toContain('droid')
      expect(types).toContain('crush')
      expect(types).toContain('kimi')
      expect(types).toContain('kilocode')
    })

    test('each strategy prepares without throwing', () => {
      const registry = createDefaultRegistry()
      const types = registry.getRegisteredTypes()

      for (const cliType of types) {
        const strategy = registry.get(cliType)
        const context: ICliStrategyContext = {
          modelConfig: { name: `test-${cliType}`, cli: cliType, model: 'default' },
          prompt: 'test prompt',
          env: {},
        }

        expect(() => strategy.prepare(context)).not.toThrow()
      }
    })
  })
})
