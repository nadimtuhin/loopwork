import { describe, test, expect, beforeEach } from 'bun:test'
import { createProviderManager } from '../../src/factories'
import { CLAUDE_LIMITS } from '../../src/providers/claude'
import { OPENAI_LIMITS } from '../../src/providers/openai'
import { GEMINI_LIMITS } from '../../src/providers/gemini'

describe('ProviderManager', () => {
  let manager: any

  beforeEach(() => {
    manager = createProviderManager()
  })

  test('should create provider with default limits', () => {
    expect(manager).toBeDefined()
    expect(manager.getProviderConfig('claude')).toBeUndefined()
  })

  test('should support Claude provider (5 req/min, 50k tokens/min)', () => {
    manager.addProvider('claude', CLAUDE_LIMITS['claude-3-sonnet'])
    const config = manager.getProviderConfig('claude')
    expect(config).toBeDefined()
    expect(config.requestsPerMinute).toBe(5)
    expect(config.tokensPerMinute).toBe(40000)
  })

  test('should support OpenAI provider (varies by tier)', () => {
    manager.addProvider('openai', OPENAI_LIMITS['gpt-4'])
    const config = manager.getProviderConfig('openai')
    expect(config).toBeDefined()
    expect(config.requestsPerMinute).toBe(10)
    expect(config.tokensPerMinute).toBe(40000)
  })

  test('should support Gemini provider (60 req/min)', () => {
    manager.addProvider('gemini', GEMINI_LIMITS['gemini-pro'])
    const config = manager.getProviderConfig('gemini')
    expect(config).toBeDefined()
    expect(config.requestsPerMinute).toBe(60)
    expect(config.tokensPerMinute).toBe(32000)
  })

  test('should track per-provider rate limits independently', async () => {
    manager.addProvider('provider1', { requestsPerMinute: 2, tokensPerMinute: 1000 })
    manager.addProvider('provider2', { requestsPerMinute: 5, tokensPerMinute: 1000 })

    // Simulate usage for provider1
    expect(await manager.checkLimit('provider1')).toBe(true)
    expect(await manager.checkLimit('provider1')).toBe(true)
    expect(await manager.checkLimit('provider1')).toBe(false) // Limit reached

    // Provider2 should still work
    expect(await manager.checkLimit('provider2')).toBe(true)
  })

  test('should handle multiple providers simultaneously', () => {
    manager.addProvider('claude', CLAUDE_LIMITS['claude-3-sonnet'])
    manager.addProvider('openai', OPENAI_LIMITS['gpt-4'])
    
    expect(manager.getProviderConfig('claude')).toBeDefined()
    expect(manager.getProviderConfig('openai')).toBeDefined()
  })

  test('should validate provider names', () => {
    manager.addProvider('claude', CLAUDE_LIMITS['claude-3-sonnet'])
    expect(() => manager.addProvider('claude', CLAUDE_LIMITS['claude-3-sonnet'])).toThrow()
  })
  
  test('should get provider configuration', () => {
    const config = { requestsPerMinute: 10, tokensPerMinute: 100 }
    manager.addProvider('test', config)
    expect(manager.getProviderConfig('test')).toEqual(config)
  })
})
