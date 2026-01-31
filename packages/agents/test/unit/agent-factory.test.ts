import { describe, test, expect } from 'bun:test'
import { AgentFactory } from '../../src/core/agent-factory'
import type { AgentDefinitionInput } from '../../src/contracts/agent'

describe('AgentFactory', () => {
  const factory = new AgentFactory()

  describe('create()', () => {
    test('creates an agent with required fields', () => {
      const input: AgentDefinitionInput = {
        name: 'test-agent',
        description: 'A test agent',
        prompt: 'You are a test agent',
      }

      const agent = factory.create(input)

      expect(agent.name).toBe('test-agent')
      expect(agent.description).toBe('A test agent')
      expect(agent.prompt).toBe('You are a test agent')
    })

    test('creates an agent with optional fields', () => {
      const input: AgentDefinitionInput = {
        name: 'full-agent',
        description: 'A full agent',
        prompt: 'You are a full agent',
        tools: ['read', 'write'],
        model: 'opus',
        env: { API_KEY: 'test-key' },
        timeout: 60000,
      }

      const agent = factory.create(input)

      expect(agent.tools).toEqual(['read', 'write'])
      expect(agent.model).toBe('opus')
      expect(agent.env).toEqual({ API_KEY: 'test-key' })
      expect(agent.timeout).toBe(60000)
    })

    test('returns a frozen object', () => {
      const input: AgentDefinitionInput = {
        name: 'frozen-agent',
        description: 'A frozen agent',
        prompt: 'You are frozen',
      }

      const agent = factory.create(input)

      expect(Object.isFrozen(agent)).toBe(true)
    })

    test('freezes nested objects', () => {
      const input: AgentDefinitionInput = {
        name: 'nested-agent',
        description: 'Has nested objects',
        prompt: 'Nested',
        tools: ['tool1'],
        env: { KEY: 'value' },
      }

      const agent = factory.create(input)

      expect(Object.isFrozen(agent.tools)).toBe(true)
      expect(Object.isFrozen(agent.env)).toBe(true)
    })
  })

  describe('validate()', () => {
    test('validates a correct agent definition', () => {
      const agent = factory.create({
        name: 'valid-agent',
        description: 'Valid',
        prompt: 'Valid prompt',
      })

      const result = factory.validate(agent)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('rejects agent with empty name', () => {
      // Create manually to bypass factory validation
      const agent = {
        name: '',
        description: 'Has description',
        prompt: 'Has prompt',
      } as const

      const result = factory.validate(agent)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Agent name is required')
    })

    test('rejects agent with empty prompt', () => {
      const agent = {
        name: 'no-prompt',
        description: 'Has description',
        prompt: '',
      } as const

      const result = factory.validate(agent)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Agent prompt is required')
    })

    test('rejects agent with invalid timeout', () => {
      const agent = {
        name: 'bad-timeout',
        description: 'Has description',
        prompt: 'Has prompt',
        timeout: -1,
      } as const

      const result = factory.validate(agent)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Timeout must be a positive number')
    })

    test('collects multiple validation errors', () => {
      const agent = {
        name: '',
        description: '',
        prompt: '',
        timeout: -100,
      } as const

      const result = factory.validate(agent)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThanOrEqual(2)
    })
  })
})
