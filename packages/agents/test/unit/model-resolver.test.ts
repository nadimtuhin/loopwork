import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { GenericNameRegistry, getGenericNameRegistry, resetGenericNameRegistry, toGenericName, resolveBrandName,  } from '../../src/invokers/model-resolver'

describe('GenericNameRegistry', () => {
  let registry: GenericNameRegistry

  beforeEach(() => {
    registry = new GenericNameRegistry()
  })

  describe('register()', () => {
    test('registers brand → generic mapping', () => {
      registry.register('my-brand', 'generic-model')
      expect(registry.toGeneric('my-brand')).toBe('generic-model')
    })

    test('registration is case-insensitive', () => {
      registry.register('MyBrand', 'generic-model')
      expect(registry.toGeneric('mybrand')).toBe('generic-model')
      expect(registry.toGeneric('MYBRAND')).toBe('generic-model')
    })

    test('registers both full name and provider-stripped version', () => {
      registry.register('google/my-brand', 'generic-model')
      expect(registry.toGeneric('google/my-brand')).toBe('generic-model')
      expect(registry.toGeneric('my-brand')).toBe('generic-model')
    })
  })

  describe('registerAll()', () => {
    test('registers multiple mappings at once', () => {
      registry.registerAll({
        'brand-a': 'generic-a',
        'brand-b': 'generic-b',
        'brand-c': 'generic-c',
      })
      expect(registry.toGeneric('brand-a')).toBe('generic-a')
      expect(registry.toGeneric('brand-b')).toBe('generic-b')
      expect(registry.toGeneric('brand-c')).toBe('generic-c')
    })
  })

  describe('toGeneric()', () => {
    test('resolves registered brand to generic', () => {
      registry.register('antigravity-gemini-3-flash', 'gemini-3-flash')
      expect(registry.toGeneric('antigravity-gemini-3-flash')).toBe('gemini-3-flash')
    })

    test('resolves with provider prefix', () => {
      registry.register('antigravity-gemini-3-flash', 'gemini-3-flash')
      expect(registry.toGeneric('google/antigravity-gemini-3-flash')).toBe('gemini-3-flash')
    })

    test('returns as-is when not registered', () => {
      expect(registry.toGeneric('unregistered-model')).toBe('unregistered-model')
    })

    test('strips provider prefix for unregistered models', () => {
      expect(registry.toGeneric('google/unregistered-model')).toBe('unregistered-model')
    })
  })

  describe('resolve()', () => {
    test('returns full details for registered brand', () => {
      registry.register('my-brand', 'generic-model')
      const result = registry.resolve('google/my-brand')

      expect(result.brand).toBe('google/my-brand')
      expect(result.provider).toBe('google')
      expect(result.generic).toBe('generic-model')
      expect(result.registered).toBe(true)
    })

    test('returns registered=false for unregistered brand', () => {
      const result = registry.resolve('unregistered')
      expect(result.registered).toBe(false)
      expect(result.generic).toBe('unregistered')
    })
  })

  describe('has()', () => {
    test('returns true for registered brand', () => {
      registry.register('my-brand', 'generic')
      expect(registry.has('my-brand')).toBe(true)
    })

    test('returns true with provider prefix', () => {
      registry.register('my-brand', 'generic')
      expect(registry.has('google/my-brand')).toBe(true)
    })

    test('returns false for unregistered brand', () => {
      expect(registry.has('unknown')).toBe(false)
    })
  })

  describe('getMappings()', () => {
    test('returns all registered mappings', () => {
      registry.register('brand-a', 'generic-a')
      registry.register('brand-b', 'generic-b')

      const mappings = registry.getMappings()
      expect(mappings.get('brand-a')).toBe('generic-a')
      expect(mappings.get('brand-b')).toBe('generic-b')
    })
  })
})

describe('Singleton functions', () => {
  afterEach(() => {
    resetGenericNameRegistry()
  })

  describe('getGenericNameRegistry()', () => {
    test('returns singleton instance', () => {
      const registry1 = getGenericNameRegistry()
      const registry2 = getGenericNameRegistry()
      expect(registry1).toBe(registry2)
    })
  })

  describe('toGenericName()', () => {
    test('uses singleton registry', () => {
      getGenericNameRegistry().register('my-brand', 'my-generic')
      expect(toGenericName('my-brand')).toBe('my-generic')
    })
  })

  describe('resolveBrandName()', () => {
    test('uses singleton registry', () => {
      getGenericNameRegistry().register('my-brand', 'my-generic')
      const result = resolveBrandName('google/my-brand')

      expect(result.brand).toBe('google/my-brand')
      expect(result.provider).toBe('google')
      expect(result.generic).toBe('my-generic')
      expect(result.registered).toBe(true)
    })
  })

  describe('resetGenericNameRegistry()', () => {
    test('clears singleton', () => {
      const registry1 = getGenericNameRegistry()
      registry1.register('test', 'generic')

      resetGenericNameRegistry()

      const registry2 = getGenericNameRegistry()
      expect(registry2.has('test')).toBe(false)
    })
  })
})

describe('Real-world usage', () => {
  let registry: GenericNameRegistry

  beforeEach(() => {
    registry = new GenericNameRegistry()
    // Register brand → generic mappings (REQUIRED)
    registry.registerAll({
      // Gemini brands
      'antigravity-gemini-3-flash': 'gemini-3-flash',
      'custom-gemini-1.5-pro': 'gemini-1.5-pro',
      // Claude brands
      'my-claude-3-sonnet': 'claude-3-sonnet',
      'enterprise-opus': 'claude-opus',
      // Short aliases
      'fast': 'gemini-flash',
      'smart': 'gpt-4o',
      'cheap': 'claude-haiku',
    })
  })

  test('resolves registered Gemini brands', () => {
    expect(registry.toGeneric('google/antigravity-gemini-3-flash')).toBe('gemini-3-flash')
    expect(registry.toGeneric('antigravity-gemini-3-flash')).toBe('gemini-3-flash')
  })

  test('resolves registered Claude brands', () => {
    expect(registry.toGeneric('anthropic/my-claude-3-sonnet')).toBe('claude-3-sonnet')
    expect(registry.toGeneric('enterprise-opus')).toBe('claude-opus')
  })

  test('resolves short aliases', () => {
    expect(registry.toGeneric('fast')).toBe('gemini-flash')
    expect(registry.toGeneric('smart')).toBe('gpt-4o')
    expect(registry.toGeneric('cheap')).toBe('claude-haiku')
  })

  test('unregistered models pass through as-is', () => {
    expect(registry.toGeneric('gemini-3-flash')).toBe('gemini-3-flash')
    expect(registry.toGeneric('gpt-4')).toBe('gpt-4')
  })

  test('unregistered with provider strips provider only', () => {
    expect(registry.toGeneric('openai/gpt-4')).toBe('gpt-4')
  })
})
