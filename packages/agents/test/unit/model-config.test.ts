import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ModelConfigRegistry, ModelPresets, getModelConfigRegistry, resetModelConfigRegistry, getModelString, getModelCli, getModelConfig,  } from '../../src/models'
import type { ModelConfig } from '../../src/models'

describe('ModelConfigRegistry', () => {
  let registry: ModelConfigRegistry

  beforeEach(() => {
    registry = new ModelConfigRegistry()
  })

  describe('register()', () => {
    test('registers a model config', () => {
      const config: ModelConfig = {
        name: 'test-model',
        displayName: 'Test Model',
        cli: 'claude',
        model: 'test/actual-model',
      }
      registry.register(config)
      expect(registry.has('test-model')).toBe(true)
    })

    test('registration is case-insensitive', () => {
      registry.register({
        name: 'TestModel',
        displayName: 'Test',
        cli: 'claude',
        model: 'test',
      })
      expect(registry.has('testmodel')).toBe(true)
      expect(registry.has('TESTMODEL')).toBe(true)
    })
  })

  describe('get()', () => {
    test('returns registered config', () => {
      const config: ModelConfig = {
        name: 'my-model',
        displayName: 'My Model',
        cli: 'opencode',
        model: 'google/my-model',
        timeout: 300,
        costWeight: 50,
      }
      registry.register(config)

      const result = registry.get('my-model')
      expect(result).toEqual(config)
    })

    test('returns undefined for unregistered', () => {
      expect(registry.get('unknown')).toBeUndefined()
    })
  })

  describe('getModelString()', () => {
    test('returns the actual model string', () => {
      registry.register({
        name: 'gemini-flash',
        displayName: 'Gemini Flash',
        cli: 'opencode',
        model: 'google/antigravity-gemini-3-flash',
      })
      expect(registry.getModelString('gemini-flash')).toBe('google/antigravity-gemini-3-flash')
    })
  })

  describe('getCli()', () => {
    test('returns the CLI for a model', () => {
      registry.register({
        name: 'gemini-flash',
        displayName: 'Gemini Flash',
        cli: 'opencode',
        model: 'google/antigravity-gemini-3-flash',
      })
      expect(registry.getCli('gemini-flash')).toBe('opencode')
    })
  })

  describe('list()', () => {
    test('returns all registered configs', () => {
      registry.register({ name: 'a', displayName: 'A', cli: 'claude', model: 'a' })
      registry.register({ name: 'b', displayName: 'B', cli: 'opencode', model: 'b' })

      const list = registry.list()
      expect(list).toHaveLength(2)
      expect(list.map(c => c.name)).toContain('a')
      expect(list.map(c => c.name)).toContain('b')
    })
  })
})

describe('ModelPresets', () => {
  test('geminiFlash returns correct config', () => {
    const config = ModelPresets.geminiFlash()
    expect(config.name).toBe('gemini-flash')
    expect(config.cli).toBe('opencode')
    expect(config.model).toBe('google/antigravity-gemini-3-flash')
  })

  test('geminiFlash accepts overrides', () => {
    const config = ModelPresets.geminiFlash({ timeout: 500, costWeight: 100 })
    expect(config.name).toBe('gemini-flash')
    expect(config.timeout).toBe(500)
    expect(config.costWeight).toBe(100)
  })

  test('claudeSonnet returns correct config', () => {
    const config = ModelPresets.claudeSonnet()
    expect(config.name).toBe('claude-sonnet')
    expect(config.cli).toBe('claude')
    expect(config.model).toBe('sonnet')
  })

  test('claudeOpus returns correct config', () => {
    const config = ModelPresets.claudeOpus()
    expect(config.name).toBe('claude-opus')
    expect(config.cli).toBe('claude')
    expect(config.model).toBe('opus')
  })

  test('claudeHaiku returns correct config', () => {
    const config = ModelPresets.claudeHaiku()
    expect(config.name).toBe('claude-haiku')
    expect(config.cli).toBe('claude')
    expect(config.model).toBe('haiku')
  })

  test('gpt4o returns correct config', () => {
    const config = ModelPresets.gpt4o()
    expect(config.name).toBe('gpt-4o')
    expect(config.cli).toBe('droid')
    expect(config.model).toBe('openai/gpt-4o')
  })
})

describe('Singleton functions', () => {
  afterEach(() => {
    resetModelConfigRegistry()
  })

  test('getModelConfigRegistry returns singleton with presets', () => {
    const registry = getModelConfigRegistry()

    // Should have built-in presets
    expect(registry.has('gemini-flash')).toBe(true)
    expect(registry.has('claude-sonnet')).toBe(true)
    expect(registry.has('gpt-4o')).toBe(true)
  })

  test('getModelString uses singleton', () => {
    expect(getModelString('gemini-flash')).toBe('google/antigravity-gemini-3-flash')
    expect(getModelString('claude-sonnet')).toBe('sonnet')
  })

  test('getModelCli uses singleton', () => {
    expect(getModelCli('gemini-flash')).toBe('opencode')
    expect(getModelCli('claude-sonnet')).toBe('claude')
  })

  test('getModelConfig uses singleton', () => {
    const config = getModelConfig('gemini-flash')
    expect(config).toBeDefined()
    expect(config?.displayName).toBe('Gemini Flash')
  })

  test('resetModelConfigRegistry clears singleton', () => {
    const registry1 = getModelConfigRegistry()
    registry1.register({
      name: 'custom',
      displayName: 'Custom',
      cli: 'claude',
      model: 'custom',
    })

    resetModelConfigRegistry()

    const registry2 = getModelConfigRegistry()
    // custom should be gone, but presets remain
    expect(registry2.has('custom')).toBe(false)
    expect(registry2.has('gemini-flash')).toBe(true)
  })
})

describe('Real-world usage', () => {
  afterEach(() => {
    resetModelConfigRegistry()
  })

  test('register custom model and look up', () => {
    const registry = getModelConfigRegistry()

    // Register a custom enterprise model
    registry.register({
      name: 'enterprise-fast',
      displayName: 'Enterprise Fast Model',
      cli: 'opencode',
      model: 'google/enterprise-gemini-3-flash',
      timeout: 120,
      costWeight: 20,
    })

    // Look up by generic name
    expect(getModelString('enterprise-fast')).toBe('google/enterprise-gemini-3-flash')
    expect(getModelCli('enterprise-fast')).toBe('opencode')
  })

  test('override preset config', () => {
    const registry = getModelConfigRegistry()

    // Override gemini-flash with custom settings
    registry.register(ModelPresets.geminiFlash({
      model: 'google/my-custom-gemini',
      timeout: 60,
    }))

    expect(getModelString('gemini-flash')).toBe('google/my-custom-gemini')
    expect(getModelConfig('gemini-flash')?.timeout).toBe(60)
  })
})
