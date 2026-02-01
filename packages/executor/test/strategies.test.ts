import { describe, test, expect } from 'bun:test'
import { ClaudeStrategy } from '../src/strategies/claude-strategy'
import { OpenCodeStrategy } from '../src/strategies/opencode-strategy'
import { GeminiStrategy } from '../src/strategies/gemini-strategy'
import { CliStrategyRegistry, createDefaultRegistry } from '../src/strategies/registry'
import type { ICliStrategyContext, ModelConfig } from '@loopwork-ai/contracts'

describe('ClaudeStrategy', () => {
  const strategy = new ClaudeStrategy()

  test('has correct cliType', () => {
    expect(strategy.cliType).toBe('claude')
  })

  test('prepare returns empty args with stdinInput', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'claude-sonnet', cli: 'claude', model: 'sonnet' },
      prompt: 'test prompt',
      env: { HOME: '/home/user' },
    }

    const result = strategy.prepare(context)

    expect(result.args).toEqual([])
    expect(result.stdinInput).toBe('test prompt')
    expect(result.displayName).toBe('claude-sonnet')
    expect(result.env).toEqual({ HOME: '/home/user' })
  })

  test('prepare includes modelConfig.args', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'claude', cli: 'claude', model: 'sonnet', args: ['--verbose'] },
      prompt: 'test',
      env: {},
    }

    const result = strategy.prepare(context)
    expect(result.args).toEqual(['--verbose'])
  })

  test('prepare uses displayName if provided', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'claude-sonnet', displayName: 'Sonnet', cli: 'claude', model: 'sonnet' },
      prompt: 'test',
      env: {},
    }

    const result = strategy.prepare(context)
    expect(result.displayName).toBe('Sonnet')
  })

  test('getRateLimitPatterns returns patterns', () => {
    const patterns = strategy.getRateLimitPatterns()
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns[0].test('rate limit exceeded')).toBe(true)
  })
})

describe('OpenCodeStrategy', () => {
  const strategy = new OpenCodeStrategy()

  test('has correct cliType', () => {
    expect(strategy.cliType).toBe('opencode')
  })

  test('prepare builds opencode args with model', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'opencode-flash', cli: 'opencode', model: 'google/antigravity-gemini-3-flash' },
      prompt: 'test prompt',
      env: { HOME: '/home/user' },
    }

    const result = strategy.prepare(context)

    expect(result.args).toEqual(['run', '--model', 'google/antigravity-gemini-3-flash', 'test prompt'])
    expect(result.stdinInput).toBeUndefined()
    expect(result.displayName).toBe('opencode/opencode-flash')
    expect(result.env['OPENCODE_PERMISSION']).toBe('{"*":"allow"}')
  })

  test('prepare preserves existing OPENCODE_PERMISSION', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'opencode', cli: 'opencode', model: 'model' },
      prompt: 'test',
      env: { OPENCODE_PERMISSION: '{"read":"allow"}' },
    }

    const result = strategy.prepare(context)
    expect(result.env['OPENCODE_PERMISSION']).toBe('{"read":"allow"}')
  })

  test('prepare uses permissions if provided', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'opencode', cli: 'opencode', model: 'model' },
      prompt: 'test',
      env: {},
      permissions: { 'OPENCODE_PERMISSION': '{"write":"deny"}' },
    }

    const result = strategy.prepare(context)
    expect(result.env['OPENCODE_PERMISSION']).toBe('{"write":"deny"}')
  })

  test('detectCacheCorruption returns true for ENOENT errors', () => {
    expect(strategy.detectCacheCorruption('ENOENT reading /home/.cache/opencode/node_modules/foo')).toBe(true)
    expect(strategy.detectCacheCorruption('BuildMessage: ENOENT opencode error')).toBe(true)
  })

  test('detectCacheCorruption returns false for unrelated errors', () => {
    expect(strategy.detectCacheCorruption('Some other error')).toBe(false)
    expect(strategy.detectCacheCorruption('ENOENT reading /home/.cache/other')).toBe(false)
  })
})

describe('GeminiStrategy', () => {
  const strategy = new GeminiStrategy()

  test('has correct cliType', () => {
    expect(strategy.cliType).toBe('gemini')
  })

  test('prepare builds gemini args', () => {
    const context: ICliStrategyContext = {
      modelConfig: { name: 'gemini-pro', cli: 'gemini', model: 'pro' },
      prompt: 'test prompt',
      env: { HOME: '/home/user' },
    }

    const result = strategy.prepare(context)

    expect(result.args).toEqual(['--model', 'pro'])
    expect(result.stdinInput).toBe('test prompt')
    expect(result.displayName).toBe('gemini/gemini-pro')
  })

  test('getRateLimitPatterns includes RESOURCE_EXHAUSTED', () => {
    const patterns = strategy.getRateLimitPatterns()
    expect(patterns.some(p => p.test('RESOURCE_EXHAUSTED'))).toBe(true)
  })
})

describe('CliStrategyRegistry', () => {
  test('register and get strategy', () => {
    const registry = new CliStrategyRegistry()
    const strategy = new ClaudeStrategy()

    registry.register(strategy)

    expect(registry.has('claude')).toBe(true)
    expect(registry.get('claude')).toBe(strategy)
  })

  test('get throws for unregistered CLI type', () => {
    const registry = new CliStrategyRegistry()

    expect(() => registry.get('claude')).toThrow('No strategy registered for CLI type: claude')
  })

  test('getRegisteredTypes returns all types', () => {
    const registry = new CliStrategyRegistry()
    registry.register(new ClaudeStrategy())
    registry.register(new OpenCodeStrategy())

    const types = registry.getRegisteredTypes()
    expect(types).toContain('claude')
    expect(types).toContain('opencode')
  })
})

describe('createDefaultRegistry', () => {
  test('creates registry with all strategies', () => {
    const registry = createDefaultRegistry()

    expect(registry.has('claude')).toBe(true)
    expect(registry.has('opencode')).toBe(true)
    expect(registry.has('gemini')).toBe(true)
  })

  test('strategies are correct types', () => {
    const registry = createDefaultRegistry()

    expect(registry.get('claude').cliType).toBe('claude')
    expect(registry.get('opencode').cliType).toBe('opencode')
    expect(registry.get('gemini').cliType).toBe('gemini')
  })
})
