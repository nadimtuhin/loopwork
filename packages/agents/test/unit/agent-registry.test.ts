import { describe, test, expect, beforeEach } from 'bun:test'
import { AgentRegistry } from '../../src/core/agent-registry'
import type { AgentDefinition } from '../../src/contracts/agent'

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  const createAgent = (name: string): AgentDefinition => ({
    name,
    description: `Agent ${name}`,
    prompt: `You are ${name}`,
  })

  beforeEach(() => {
    registry = new AgentRegistry()
  })

  describe('register()', () => {
    test('registers an agent successfully', () => {
      const agent = createAgent('test-agent')

      registry.register(agent)

      expect(registry.has('test-agent')).toBe(true)
    })

    test('throws when registering duplicate agent name', () => {
      const agent = createAgent('duplicate')
      registry.register(agent)

      expect(() => registry.register(agent)).toThrow(
        'Agent "duplicate" is already registered'
      )
    })
  })

  describe('get()', () => {
    test('returns agent by name', () => {
      const agent = createAgent('find-me')
      registry.register(agent)

      const found = registry.get('find-me')

      expect(found).toEqual(agent)
    })

    test('returns undefined for unknown agent', () => {
      const found = registry.get('unknown')

      expect(found).toBeUndefined()
    })
  })

  describe('list()', () => {
    test('returns empty array when no agents registered', () => {
      const agents = registry.list()

      expect(agents).toEqual([])
    })

    test('returns all registered agents', () => {
      const agent1 = createAgent('agent-1')
      const agent2 = createAgent('agent-2')
      registry.register(agent1)
      registry.register(agent2)

      const agents = registry.list()

      expect(agents).toHaveLength(2)
      expect(agents).toContainEqual(agent1)
      expect(agents).toContainEqual(agent2)
    })

    test('returns a readonly array', () => {
      const agent = createAgent('readonly-test')
      registry.register(agent)

      const agents = registry.list()

      expect(Object.isFrozen(agents)).toBe(true)
    })
  })

  describe('setDefault()', () => {
    test('sets the default agent', () => {
      const agent = createAgent('default-agent')
      registry.register(agent)

      registry.setDefault('default-agent')

      expect(registry.getDefault()).toEqual(agent)
    })

    test('throws when setting default to unknown agent', () => {
      expect(() => registry.setDefault('unknown')).toThrow(
        'Agent "unknown" not found'
      )
    })
  })

  describe('getDefault()', () => {
    test('returns undefined when no default set', () => {
      expect(registry.getDefault()).toBeUndefined()
    })

    test('returns the default agent after setDefault', () => {
      const agent = createAgent('my-default')
      registry.register(agent)
      registry.setDefault('my-default')

      expect(registry.getDefault()).toEqual(agent)
    })
  })

  describe('has()', () => {
    test('returns true for registered agent', () => {
      registry.register(createAgent('exists'))

      expect(registry.has('exists')).toBe(true)
    })

    test('returns false for unregistered agent', () => {
      expect(registry.has('not-exists')).toBe(false)
    })
  })

  describe('unregister()', () => {
    test('removes a registered agent', () => {
      registry.register(createAgent('remove-me'))

      const removed = registry.unregister('remove-me')

      expect(removed).toBe(true)
      expect(registry.has('remove-me')).toBe(false)
    })

    test('returns false for unknown agent', () => {
      const removed = registry.unregister('unknown')

      expect(removed).toBe(false)
    })

    test('clears default if default agent is unregistered', () => {
      const agent = createAgent('default-to-remove')
      registry.register(agent)
      registry.setDefault('default-to-remove')

      registry.unregister('default-to-remove')

      expect(registry.getDefault()).toBeUndefined()
    })
  })

  describe('clear()', () => {
    test('removes all agents', () => {
      registry.register(createAgent('agent-1'))
      registry.register(createAgent('agent-2'))

      registry.clear()

      expect(registry.list()).toHaveLength(0)
    })

    test('clears the default agent', () => {
      const agent = createAgent('default')
      registry.register(agent)
      registry.setDefault('default')

      registry.clear()

      expect(registry.getDefault()).toBeUndefined()
    })
  })
})
