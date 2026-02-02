import { describe, expect, test } from 'bun:test'
import { ModelPresets } from '../model-config'

describe('ModelPresets Capabilities', () => {
  test('geminiFlash has correct capability', () => {
    const config = ModelPresets.geminiFlash()
    expect(config.capability).toBe('low')
    expect(config.primaryRole).toBe('engineer')
  })

  test('claudeOpus has correct capability', () => {
    const config = ModelPresets.claudeOpus()
    expect(config.capability).toBe('high')
    expect(config.primaryRole).toBe('architect')
  })

  test('geminiPro has correct capability', () => {
    const config = ModelPresets.geminiPro()
    expect(config.capability).toBe('medium')
    expect(config.primaryRole).toBe('senior-engineer')
  })
})
