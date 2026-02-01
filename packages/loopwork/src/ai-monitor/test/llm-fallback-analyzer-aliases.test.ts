import { describe, expect, test } from 'bun:test'
import { LLMFallbackAnalyzer } from '../llm-fallback-analyzer'

describe('LLMFallbackAnalyzer Model Aliases', () => {
  test('should map "haiku" to full model ID', () => {
    const analyzer = new LLMFallbackAnalyzer({
      model: 'haiku'
    })
    
    // Access private config via type casting or introspection for testing
    const config = (analyzer as any).config
    expect(config.model).toBe('claude-3-haiku-20240307')
  })

  test('should map "sonnet" to full model ID', () => {
    const analyzer = new LLMFallbackAnalyzer({
      model: 'sonnet'
    })
    
    const config = (analyzer as any).config
    expect(config.model).toBe('claude-3-5-sonnet-20240620')
  })

  test('should map "opus" to full model ID', () => {
    const analyzer = new LLMFallbackAnalyzer({
      model: 'opus'
    })
    
    const config = (analyzer as any).config
    expect(config.model).toBe('claude-3-opus-20240229')
  })

  test('should keep full model ID if provided', () => {
    const fullId = 'claude-3-haiku-20240307'
    const analyzer = new LLMFallbackAnalyzer({
      model: fullId
    })
    
    const config = (analyzer as any).config
    expect(config.model).toBe(fullId)
  })

  test('should keep unknown model ID if provided', () => {
    const unknownId = 'custom-model-id'
    const analyzer = new LLMFallbackAnalyzer({
      model: unknownId
    })
    
    const config = (analyzer as any).config
    expect(config.model).toBe(unknownId)
  })
})
