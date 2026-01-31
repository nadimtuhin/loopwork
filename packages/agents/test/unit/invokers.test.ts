import { describe, test, expect, mock, beforeEach, spyOn } from 'bun:test'
import { ClaudeInvoker } from '../../src/invokers/claude-invoker'
import { OpenCodeInvoker } from '../../src/invokers/opencode-invoker'
import { DroidInvoker } from '../../src/invokers/droid-invoker'
import { CliInvokerRegistry } from '../../src/invokers/registry'
import { createInvokerRegistry, parseModelName, stripModelPrefix } from '../../src/invokers'
import type { CliInvokeOptions, ICliInvoker } from '../../src/contracts/invoker'

describe('Model Prefix Parsing', () => {
  describe('parseModelName()', () => {
    test('parses model with provider prefix', () => {
      const result = parseModelName('google/gemini-3-flash')
      expect(result.provider).toBe('google')
      expect(result.model).toBe('gemini-3-flash')
    })

    test('parses model with anthropic prefix', () => {
      const result = parseModelName('anthropic/claude-3-sonnet')
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-sonnet')
    })

    test('parses model without prefix', () => {
      const result = parseModelName('sonnet')
      expect(result.provider).toBeUndefined()
      expect(result.model).toBe('sonnet')
    })

    test('handles complex model names', () => {
      const result = parseModelName('openai/gpt-4-turbo-2024-04-09')
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4-turbo-2024-04-09')
    })
  })

  describe('stripModelPrefix()', () => {
    test('strips google prefix', () => {
      expect(stripModelPrefix('google/gemini-3-flash')).toBe('gemini-3-flash')
    })

    test('strips anthropic prefix', () => {
      expect(stripModelPrefix('anthropic/claude-3-sonnet')).toBe('claude-3-sonnet')
    })

    test('returns model unchanged without prefix', () => {
      expect(stripModelPrefix('sonnet')).toBe('sonnet')
    })
  })
})

describe('ClaudeInvoker', () => {
  let invoker: ClaudeInvoker

  beforeEach(() => {
    invoker = new ClaudeInvoker()
  })

  describe('buildArgs()', () => {
    test('includes --print flag for non-interactive mode', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--print')
    })

    test('maps sonnet to full model ID', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'sonnet',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4-20250514')
    })

    test('maps opus to full model ID', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'opus',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('claude-sonnet-4-20250514')
    })

    test('maps haiku to full model ID', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'haiku',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('claude-haiku-3-20240307')
    })

    test('passes through unknown model names unchanged', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'claude-3-opus-20240229',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('claude-3-opus-20240229')
    })

    test('strips provider prefix from model name', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'anthropic/sonnet',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      // Should map 'sonnet' (after stripping prefix) to full model ID
      expect(args).toContain('claude-sonnet-4-20250514')
    })

    test('includes --allowedTools when tools provided', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        tools: ['Read', 'Write', 'Bash'],
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--allowedTools')
      expect(args).toContain('Read,Write,Bash')
    })

    test('adds prompt as positional argument', () => {
      const options: CliInvokeOptions = {
        prompt: 'Do something',
        workDir: '/test',
      }
      const args = invoker.buildArgs(options)
      expect(args[args.length - 1]).toBe('Do something')
    })
  })

  describe('getSupportedModels()', () => {
    test('returns supported claude models', () => {
      const models = invoker.getSupportedModels()
      expect(models).toContain('opus')
      expect(models).toContain('sonnet')
      expect(models).toContain('haiku')
      expect(models).toContain('claude-3-opus')
      expect(models).toContain('claude-3-sonnet')
      expect(models).toContain('claude-3-haiku')
    })
  })

  describe('properties', () => {
    test('has correct name', () => {
      expect(invoker.name).toBe('claude')
    })

    test('has correct command', () => {
      expect(invoker.command).toBe('claude')
    })

    test('has description', () => {
      expect(invoker.description).toBe('Claude Code CLI (Anthropic)')
    })
  })
})

describe('OpenCodeInvoker', () => {
  let invoker: OpenCodeInvoker

  beforeEach(() => {
    invoker = new OpenCodeInvoker()
  })

  describe('buildArgs()', () => {
    test('includes --yes flag for non-interactive mode', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--yes')
    })

    test('includes model with --model flag', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'gemini-flash',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('gemini-flash')
    })

    test('includes prompt with --prompt flag', () => {
      const options: CliInvokeOptions = {
        prompt: 'Do something',
        workDir: '/test',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('--prompt')
      expect(args).toContain('Do something')
    })
  })

  describe('getSupportedModels()', () => {
    test('returns supported models', () => {
      const models = invoker.getSupportedModels()
      expect(models).toContain('gemini-flash')
      expect(models).toContain('gemini-pro')
      expect(models).toContain('gpt-4')
      expect(models).toContain('gpt-4o')
    })
  })

  describe('properties', () => {
    test('has correct name', () => {
      expect(invoker.name).toBe('opencode')
    })

    test('has correct command', () => {
      expect(invoker.command).toBe('opencode')
    })
  })
})

describe('DroidInvoker', () => {
  let invoker: DroidInvoker

  beforeEach(() => {
    invoker = new DroidInvoker()
  })

  describe('buildArgs()', () => {
    test('includes model with -m flag', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'gpt-4',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('-m')
      expect(args).toContain('gpt-4')
    })

    test('includes prompt with -p flag', () => {
      const options: CliInvokeOptions = {
        prompt: 'Do something',
        workDir: '/test',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('-p')
      expect(args).toContain('Do something')
    })

    test('strips provider prefix from model name', () => {
      const options: CliInvokeOptions = {
        prompt: 'Hello',
        workDir: '/test',
        model: 'google/gemini-3-flash',
      }
      const args = invoker.buildArgs(options)
      expect(args).toContain('-m')
      // Should strip 'google/' prefix
      expect(args).toContain('gemini-3-flash')
      expect(args).not.toContain('google/gemini-3-flash')
    })
  })

  describe('getSupportedModels()', () => {
    test('returns supported models', () => {
      const models = invoker.getSupportedModels()
      // Primary: Gemini models
      expect(models).toContain('gemini-pro')
      expect(models).toContain('gemini-flash')
      expect(models).toContain('gemini-3-flash')
      // Legacy/alternative models
      expect(models).toContain('gpt-4')
      expect(models).toContain('gpt-4o')
    })
  })

  describe('properties', () => {
    test('has correct name', () => {
      expect(invoker.name).toBe('droid')
    })

    test('has correct command', () => {
      expect(invoker.command).toBe('droid')
    })
  })
})

describe('CliInvokerRegistry', () => {
  let registry: CliInvokerRegistry

  beforeEach(() => {
    registry = new CliInvokerRegistry()
  })

  const createMockInvoker = (name: string, models: string[]): ICliInvoker => ({
    name,
    description: `Mock ${name} invoker`,
    isAvailable: mock(() => Promise.resolve(true)),
    getSupportedModels: () => models,
    invoke: mock(() => Promise.resolve({ exitCode: 0, output: '', durationMs: 100, timedOut: false })),
    buildArgs: () => [],
  })

  describe('register()', () => {
    test('registers an invoker', () => {
      const invoker = createMockInvoker('test', ['model1'])
      registry.register(invoker)
      expect(registry.get('test')).toBe(invoker)
    })

    test('indexes models to invoker', () => {
      const invoker = createMockInvoker('test', ['model1', 'model2'])
      registry.register(invoker)
      expect(registry.getForModel('model1')).toBe(invoker)
      expect(registry.getForModel('model2')).toBe(invoker)
    })
  })

  describe('get()', () => {
    test('returns undefined for unregistered invoker', () => {
      expect(registry.get('nonexistent')).toBeUndefined()
    })
  })

  describe('getForModel()', () => {
    test('returns invoker that supports the model', () => {
      const invoker = createMockInvoker('test', ['my-model'])
      registry.register(invoker)
      expect(registry.getForModel('my-model')).toBe(invoker)
    })

    test('returns undefined for unsupported model', () => {
      expect(registry.getForModel('unknown-model')).toBeUndefined()
    })

    test('first registered invoker wins for shared models', () => {
      const invoker1 = createMockInvoker('first', ['shared-model'])
      const invoker2 = createMockInvoker('second', ['shared-model'])
      registry.register(invoker1)
      registry.register(invoker2)
      expect(registry.getForModel('shared-model')).toBe(invoker1)
    })

    test('finds invoker when model has provider prefix', () => {
      const invoker = createMockInvoker('test', ['gemini-3-flash'])
      registry.register(invoker)
      // Should find invoker when using prefixed model name
      expect(registry.getForModel('google/gemini-3-flash')).toBe(invoker)
    })

    test('prefers exact match over prefix-stripped match', () => {
      const invoker1 = createMockInvoker('exact', ['google/gemini-3-flash'])
      const invoker2 = createMockInvoker('stripped', ['gemini-3-flash'])
      registry.register(invoker1)
      registry.register(invoker2)
      // Should prefer exact match
      expect(registry.getForModel('google/gemini-3-flash')).toBe(invoker1)
    })
  })

  describe('setDefault() / getDefault()', () => {
    test('sets and gets default invoker', () => {
      const invoker = createMockInvoker('test', [])
      registry.register(invoker)
      registry.setDefault('test')
      expect(registry.getDefault()).toBe(invoker)
    })

    test('throws when setting default to unregistered invoker', () => {
      expect(() => registry.setDefault('nonexistent')).toThrow('Invoker "nonexistent" not registered')
    })

    test('returns undefined when no default set', () => {
      expect(registry.getDefault()).toBeUndefined()
    })
  })

  describe('list()', () => {
    test('returns all registered invokers', () => {
      const invoker1 = createMockInvoker('first', [])
      const invoker2 = createMockInvoker('second', [])
      registry.register(invoker1)
      registry.register(invoker2)

      const list = registry.list()
      expect(list).toHaveLength(2)
      expect(list).toContain(invoker1)
      expect(list).toContain(invoker2)
    })

    test('returns empty array when no invokers registered', () => {
      expect(registry.list()).toHaveLength(0)
    })
  })

  describe('findAvailable()', () => {
    test('returns first available invoker', async () => {
      const unavailable = createMockInvoker('unavailable', [])
      ;(unavailable.isAvailable as any).mockImplementation(() => Promise.resolve(false))

      const available = createMockInvoker('available', [])
      ;(available.isAvailable as any).mockImplementation(() => Promise.resolve(true))

      registry.register(unavailable)
      registry.register(available)

      const found = await registry.findAvailable()
      expect(found).toBe(available)
    })

    test('returns undefined when no invoker available', async () => {
      const unavailable = createMockInvoker('unavailable', [])
      ;(unavailable.isAvailable as any).mockImplementation(() => Promise.resolve(false))
      registry.register(unavailable)

      const found = await registry.findAvailable()
      expect(found).toBeUndefined()
    })
  })
})

describe('createInvokerRegistry()', () => {
  test('creates registry with built-in invokers', () => {
    const registry = createInvokerRegistry()
    expect(registry.get('claude')).toBeDefined()
    expect(registry.get('opencode')).toBeDefined()
    expect(registry.get('droid')).toBeDefined()
  })

  test('sets claude as default', () => {
    const registry = createInvokerRegistry()
    const defaultInvoker = registry.getDefault()
    expect(defaultInvoker?.name).toBe('claude')
  })

  test('can find invoker for claude models', () => {
    const registry = createInvokerRegistry()
    expect(registry.getForModel('sonnet')?.name).toBe('claude')
    expect(registry.getForModel('opus')?.name).toBe('claude')
    expect(registry.getForModel('haiku')?.name).toBe('claude')
  })

  test('can find invoker for opencode models', () => {
    const registry = createInvokerRegistry()
    expect(registry.getForModel('gemini-flash')?.name).toBe('opencode')
    expect(registry.getForModel('gemini-pro')?.name).toBe('opencode')
    expect(registry.getForModel('gpt-4o')?.name).toBe('opencode')
  })
})
