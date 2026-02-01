import { describe, expect, it } from 'bun:test'
import { AgentPersonaSchema } from '../../src/schemas/persona'

describe('AgentPersonaSchema', () => {
  it('validates a correct persona', () => {
    const validPersona = {
      name: 'researcher',
      description: 'Research agent',
      prompt: 'You are a researcher.',
      role: 'specialist',
      capabilities: ['search', 'analyze'],
      model: 'claude-3-sonnet',
      tools: ['web-search'],
      timeout: 60,
    }
    
    const result = AgentPersonaSchema.safeParse(validPersona)
    expect(result.success).toBe(true)
  })

  it('validates a minimal persona', () => {
    const minimalPersona = {
      name: 'basic',
      description: 'Basic agent',
      prompt: 'Do stuff.',
    }
    
    const result = AgentPersonaSchema.safeParse(minimalPersona)
    expect(result.success).toBe(true)
  })

  it('fails on missing required fields', () => {
    const invalidPersona = {
      name: 'invalid',
      prompt: 'Prompt',
    }
    
    const result = AgentPersonaSchema.safeParse(invalidPersona)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('description')
    }
  })

  it('fails on empty strings for required fields', () => {
    const invalidPersona = {
      name: '',
      description: 'Desc',
      prompt: 'Prompt',
    }
    
    const result = AgentPersonaSchema.safeParse(invalidPersona)
    expect(result.success).toBe(false)
  })

  it('fails on invalid types', () => {
    const invalidPersona = {
      name: 'test',
      description: 'test',
      prompt: 'test',
      timeout: 'not a number',
    }
    
    const result = AgentPersonaSchema.safeParse(invalidPersona)
    expect(result.success).toBe(false)
  })
})
