import { describe, test, expect } from 'bun:test'
import { ModelPresets, RetryPresets } from '../../src/plugins/cli'

describe('ModelCapabilityPresets', () => {
  describe('Gemini Models', () => {
    test('geminiFlash maps correctly', () => {
      const model = ModelPresets.geminiFlash()
      expect(model.name).toBe('opencode-gemini-flash')
      expect(model.cli).toBe('opencode')
      expect(model.model).toBe('google/antigravity-gemini-3-flash')
      expect(model.timeout).toBe(180)
    })

    test('opencodeGeminiFlash maps correctly', () => {
      const model = ModelPresets.opencodeGeminiFlash()
      expect(model.name).toBe('opencode-gemini-flash')
      expect(model.cli).toBe('opencode')
      expect(model.model).toBe('google/antigravity-gemini-3-flash')
    })

    test('geminiPro maps correctly', () => {
      const model = ModelPresets.geminiPro()
      expect(model.name).toBe('opencode-gemini-pro-low')
      expect(model.cli).toBe('opencode')
      expect(model.model).toBe('google/antigravity-gemini-3-pro-low')
      expect(model.timeout).toBe(600)
    })

    test('opencodeGeminiProHigh maps correctly', () => {
      const model = ModelPresets.opencodeGeminiProHigh()
      expect(model.name).toBe('opencode-gemini-pro-high')
      expect(model.cli).toBe('opencode')
      expect(model.model).toBe('google/antigravity-gemini-3-pro-high')
    })

    test('opencodeGeminiProLow maps correctly', () => {
      const model = ModelPresets.opencodeGeminiProLow()
      expect(model.name).toBe('opencode-gemini-pro-low')
      expect(model.cli).toBe('opencode')
      expect(model.model).toBe('google/antigravity-gemini-3-pro-low')
    })
  })

  describe('Capability Levels', () => {
    test('capabilityHigh maps to Opus with correct defaults', () => {
      const model = ModelPresets.capabilityHigh()
      expect(model.name).toBe('claude-code-opus')
      expect(model.displayName).toBe('High Capability (Opus)')
      expect(model.model).toBe('opus')
      expect(model.timeout).toBe(900)
    })

    test('capabilityMedium maps to Sonnet with correct defaults', () => {
      const model = ModelPresets.capabilityMedium()
      expect(model.name).toBe('claude-code-sonnet')
      expect(model.displayName).toBe('Medium Capability (Sonnet)')
      expect(model.model).toBe('sonnet')
      expect(model.timeout).toBe(300)
    })

    test('capabilityLow maps to Haiku with correct defaults', () => {
      const model = ModelPresets.capabilityLow()
      expect(model.name).toBe('claude-code-haiku')
      expect(model.displayName).toBe('Low Capability (Haiku)')
      expect(model.model).toBe('haiku')
      expect(model.timeout).toBe(120)
    })

    test('capabilities accept overrides', () => {
      const model = ModelPresets.capabilityHigh({ timeout: 1000 })
      expect(model.timeout).toBe(1000)
      expect(model.name).toBe('claude-code-opus')
    })
  })

  describe('Roles', () => {
    test('roleArchitect maps to High Capability', () => {
      const model = ModelPresets.roleArchitect()
      expect(model.displayName).toBe('Role: Architect')
      expect(model.model).toBe('opus')
    })

    test('roleEngineer maps to Medium Capability', () => {
      const model = ModelPresets.roleEngineer()
      expect(model.displayName).toBe('Role: Senior Engineer')
      expect(model.model).toBe('sonnet')
    })

    test('roleJunior maps to Low Capability', () => {
      const model = ModelPresets.roleJunior()
      expect(model.displayName).toBe('Role: Junior Engineer')
      expect(model.model).toBe('haiku')
    })

    test('roles accept overrides', () => {
      const model = ModelPresets.roleArchitect({ costWeight: 200 })
      expect(model.costWeight).toBe(200)
    })
  })

  describe('Retry Presets', () => {
    test('default retry preset', () => {
      const retry = RetryPresets.default()
      expect(retry.exponentialBackoff).toBe(false)
      expect(retry.rateLimitWaitMs).toBe(30000)
    })

    test('aggressive retry preset', () => {
      const retry = RetryPresets.aggressive()
      expect(retry.exponentialBackoff).toBe(true)
      expect(retry.retrySameModel).toBe(true)
      expect(retry.maxRetriesPerModel).toBe(3)
    })

    test('gentle retry preset', () => {
      const retry = RetryPresets.gentle()
      expect(retry.exponentialBackoff).toBe(false)
      expect(retry.rateLimitWaitMs).toBe(120000)
      expect(retry.retrySameModel).toBe(false)
    })
  })
})
