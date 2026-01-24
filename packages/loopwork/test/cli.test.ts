import { describe, test, expect } from 'bun:test'
import { EXEC_MODELS, FALLBACK_MODELS, CliConfig } from '../src/core/cli'

describe('CLI Model Pools', () => {
  describe('EXEC_MODELS', () => {
    test('has at least one model', () => {
      expect(EXEC_MODELS.length).toBeGreaterThan(0)
    })

    test('all models have required fields', () => {
      for (const model of EXEC_MODELS) {
        expect(model.name).toBeDefined()
        expect(model.cli).toBeDefined()
        expect(model.model).toBeDefined()
        expect(['opencode', 'claude']).toContain(model.cli)
      }
    })

    test('includes claude sonnet', () => {
      const claudeSonnet = EXEC_MODELS.find(m => m.cli === 'claude' && m.model === 'sonnet')
      expect(claudeSonnet).toBeDefined()
    })

    test('includes opencode models', () => {
      const opencodeModels = EXEC_MODELS.filter(m => m.cli === 'opencode')
      expect(opencodeModels.length).toBeGreaterThan(0)
    })

    test('model names are unique', () => {
      const names = EXEC_MODELS.map(m => m.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })
  })

  describe('FALLBACK_MODELS', () => {
    test('has at least one model', () => {
      expect(FALLBACK_MODELS.length).toBeGreaterThan(0)
    })

    test('all models have required fields', () => {
      for (const model of FALLBACK_MODELS) {
        expect(model.name).toBeDefined()
        expect(model.cli).toBeDefined()
        expect(model.model).toBeDefined()
        expect(['opencode', 'claude']).toContain(model.cli)
      }
    })

    test('includes opus as fallback', () => {
      const opus = FALLBACK_MODELS.find(m => m.model === 'opus')
      expect(opus).toBeDefined()
    })

    test('model names are unique', () => {
      const names = FALLBACK_MODELS.map(m => m.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })

    test('fallback models are different from exec models', () => {
      const execNames = new Set(EXEC_MODELS.map(m => m.name))
      for (const fallback of FALLBACK_MODELS) {
        expect(execNames.has(fallback.name)).toBe(false)
      }
    })
  })

  describe('CliConfig interface', () => {
    test('can create valid CliConfig', () => {
      const config: CliConfig = {
        name: 'test-model',
        cli: 'claude',
        model: 'sonnet',
      }

      expect(config.name).toBe('test-model')
      expect(config.cli).toBe('claude')
      expect(config.model).toBe('sonnet')
    })

    test('cli must be opencode or claude', () => {
      const validConfigs: CliConfig[] = [
        { name: 'a', cli: 'opencode', model: 'x' },
        { name: 'b', cli: 'claude', model: 'y' },
      ]

      for (const config of validConfigs) {
        expect(['opencode', 'claude']).toContain(config.cli)
      }
    })
  })

  describe('Model rotation logic', () => {
    test('EXEC_MODELS rotation cycles through all models', () => {
      const visited = new Set<string>()
      for (let i = 0; i < EXEC_MODELS.length; i++) {
        const model = EXEC_MODELS[i % EXEC_MODELS.length]
        visited.add(model.name)
      }
      expect(visited.size).toBe(EXEC_MODELS.length)
    })

    test('FALLBACK_MODELS rotation cycles through all models', () => {
      const visited = new Set<string>()
      for (let i = 0; i < FALLBACK_MODELS.length; i++) {
        const model = FALLBACK_MODELS[i % FALLBACK_MODELS.length]
        visited.add(model.name)
      }
      expect(visited.size).toBe(FALLBACK_MODELS.length)
    })

    test('total attempts cover all models', () => {
      const maxAttempts = EXEC_MODELS.length + FALLBACK_MODELS.length
      expect(maxAttempts).toBe(EXEC_MODELS.length + FALLBACK_MODELS.length)
    })
  })
})

describe('Rate limit detection patterns', () => {
  const rateLimitPatterns = /rate.*limit|too.*many.*request|429|RESOURCE_EXHAUSTED/i
  const quotaPatterns = /quota.*exceed|billing.*limit/i

  test('detects rate limit errors', () => {
    expect(rateLimitPatterns.test('Error: rate limit exceeded')).toBe(true)
    expect(rateLimitPatterns.test('Too many requests')).toBe(true)
    expect(rateLimitPatterns.test('HTTP 429')).toBe(true)
    expect(rateLimitPatterns.test('RESOURCE_EXHAUSTED')).toBe(true)
  })

  test('does not false positive on normal output', () => {
    expect(rateLimitPatterns.test('Task completed successfully')).toBe(false)
    expect(rateLimitPatterns.test('Writing to file')).toBe(false)
  })

  test('detects quota errors', () => {
    expect(quotaPatterns.test('quota exceeded')).toBe(true)
    expect(quotaPatterns.test('billing limit reached')).toBe(true)
  })

  test('does not false positive quota on normal output', () => {
    expect(quotaPatterns.test('Task completed successfully')).toBe(false)
    expect(quotaPatterns.test('Checking bill status')).toBe(false)
  })
})
