import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { AgentPersonaSchema } from '../persona'

/**
 * persona Tests
 * 
 * Auto-generated test suite for persona
 */

describe('persona', () => {

  describe('AgentPersonaSchema', () => {
    test('should be defined', () => {
      expect(AgentPersonaSchema).toBeDefined()
    })

    test('should validate a valid persona', () => {
      const result = AgentPersonaSchema.safeParse({
        name: 'TestAgent',
        description: 'A test agent',
        prompt: 'You are a test agent',
      })
      expect(result.success).toBe(true)
    })

    test('should reject invalid persona', () => {
      const result = AgentPersonaSchema.safeParse({
        name: '',
        description: 'A test agent',
        prompt: 'You are a test agent',
      })
      expect(result.success).toBe(false)
    })
  })
})
